import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import Papa from "papaparse"; 
import Sidebar from "../components/Sidebar";
import Pagination from "../components/Pagination";
import LimitedInput from "../components/LimitedInput";

export default function StudentPage() {
  const { userRole } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 30;
  const [totalCount, setTotalCount] = useState(0);

  // Edit State
  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", course: "", year_level: "" });
  const [saving, setSaving] = useState(false);
  const [availableCourses, setAvailableCourses] = useState([]);

  // Course Modal State
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState("");
  const [courseLoading, setCourseLoading] = useState(false);

  // Bulk Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  // Fetch Courses Logic
  useEffect(() => {
    const fetchCourses = async () => {
      const { data } = await supabase.from('courses').select('code').order('code');
      if (data) setAvailableCourses(data.map(c => c.code));
    };
    fetchCourses();
  }, []);

  // 1. Debounce Search Input
  useEffect(() => {
    const timer = setTimeout(() => {
        setDebouncedTerm(searchTerm);
        setCurrentPage(1); 
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 2. Fetch Students (The Search Logic)
  useEffect(() => {
    const fetchStudents = async () => {
        setLoading(true);
        let query = supabase.from('students').select('*', { count: 'exact' });

        if (debouncedTerm.trim()) {
            query = query.or(`name.ilike.%${debouncedTerm}%,student_id.ilike.%${debouncedTerm}%`);
        } else {
            query = query.order('name', { ascending: true });
        }

        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        const { data, count, error } = await query.range(from, to);
        
        if (error) {
            console.error("Error fetching students:", error);
        } else {
            setStudents(data || []);
            setTotalCount(count || 0);
        }
        
        setLoading(false);
    };

    fetchStudents();

    const dbChannel = supabase.channel('student-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, fetchStudents)
        .subscribe();

    return () => {
        supabase.removeChannel(dbChannel);
    };
  }, [debouncedTerm, currentPage]);


  // 3. Handlers
  const handleEditClick = (student) => {
    setEditingStudent(student);
    setEditForm({ 
        name: student.name, 
        course: student.course || "", 
        year_level: student.year_level || "" 
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if(!editingStudent) return;
    setSaving(true);

    try {
        const { error } = await supabase
            .from('students')
            .update({ 
                name: editForm.name.toUpperCase(), 
                course: editForm.course,
                year_level: editForm.year_level.toUpperCase(),
                last_updated: new Date()
            })
            .eq('student_id', editingStudent.student_id);

        if (error) throw error;
        
        setStudents(prev => prev.map(s => 
            s.student_id === editingStudent.student_id 
                ? { ...s, name: editForm.name.toUpperCase(), course: editForm.course, year_level: editForm.year_level.toUpperCase() } 
                : s
        ));
        
        // Broadcast
        await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'inventory_update', payload: {} 
        });

        setEditingStudent(null);
    } catch (err) {
        alert("Update failed: " + err.message);
    } finally {
        setSaving(false);
    }
  };

  const handleStudentImport = (e) => {
    e.preventDefault();
    const file = e.target.files[0];
    if (!file) return;

    setImportLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // 1. Map CSV Headers to DB Columns & Clean Data
          const cleanRows = results.data
            .filter(row => row['STUDENT ID'] && row['NAME'])
            .map(row => ({
              student_id: row['STUDENT ID'].trim().slice(0, 50),
              name: row['NAME'].trim().toUpperCase().slice(0, 150),
              course: row['COURSE'] ? row['COURSE'].trim().toUpperCase().slice(0, 200) : '',
              year_level: row['SEMESTER'] ? row['SEMESTER'].trim().toUpperCase().slice(0, 20) : ''
            }));

          if (cleanRows.length === 0) throw new Error("No valid data found. Check CSV headers: STUDENT ID, NAME");

          // 2. Handle Courses (Upsert unique courses first)
          const uniqueCourses = [...new Set(cleanRows.map(d => d.course).filter(Boolean))];
          if (uniqueCourses.length > 0) {
             const courseInserts = uniqueCourses.map(c => ({ code: c }));
             await supabase.from('courses').upsert(courseInserts, { onConflict: 'code' });
             setAvailableCourses(prev => [...new Set([...prev, ...uniqueCourses])].sort());
          }

          // 3. BATCH PROCESSING to avoid URL/Payload limits
          const BATCH_SIZE = 500;
          let insertedCount = 0;
          let updatedCount = 0;
          let unchangedCount = 0;

          // Loop through data in chunks
          for (let i = 0; i < cleanRows.length; i += BATCH_SIZE) {
            const batch = cleanRows.slice(i, i + BATCH_SIZE);
            const batchIds = batch.map(r => r.student_id);

            // Fetch existing only for this batch
            const { data: existingStudents, error: fetchError } = await supabase
                .from('students')
                .select('student_id, name, course, year_level')
                .in('student_id', batchIds);
                
            if (fetchError) throw fetchError;

            const existingMap = new Map();
            existingStudents.forEach(s => existingMap.set(s.student_id, s));

            const toInsert = [];
            const toUpdate = [];

            batch.forEach(row => {
                const existing = existingMap.get(row.student_id);

                if (existing) {
                    const hasChanged = 
                        existing.name !== row.name || 
                        existing.course !== row.course || 
                        existing.year_level !== row.year_level;

                    if (hasChanged) {
                        toUpdate.push({ ...row, last_updated: new Date() });
                    } else {
                        unchangedCount++;
                    }
                } else {
                    toInsert.push({ ...row, last_updated: new Date() });
                }
            });

            // Execute DB operations for this batch
            if (toInsert.length > 0) {
                const { error } = await supabase.from('students').insert(toInsert);
                if (error) throw error;
                insertedCount += toInsert.length;
            }

            if (toUpdate.length > 0) {
                const { error } = await supabase.from('students').upsert(toUpdate, { onConflict: 'student_id' });
                if (error) throw error;
                updatedCount += toUpdate.length;
            }
          }

          // 4. Final Summary
          let processedMsg = "";
          if (insertedCount > 0) processedMsg += `Added ${insertedCount} new students.\n`;
          if (updatedCount > 0) processedMsg += `Updated details for ${updatedCount} students.\n`;
          if (unchangedCount > 0) processedMsg += `${unchangedCount} records were already up to date.`;
          if (insertedCount === 0 && updatedCount === 0) processedMsg = "No changes needed. All records match.";

          alert("Import Successful!\n\n" + processedMsg);
          setIsImportModalOpen(false);
          
          await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'inventory_update', payload: {} 
          });

        } catch (err) {
          alert("Import Failed: " + err.message);
          console.error(err);
        } finally {
          setImportLoading(false);
        }
      },
      error: (error) => {
        alert("CSV Parsing Error: " + error.message);
        setImportLoading(false);
      }
    });
  };

  const handleAddCourse = async (e) => {
    e.preventDefault();
    if (!newCourseCode.trim()) return;
    setCourseLoading(true);

    try {
        const code = newCourseCode.trim().toUpperCase();
        const { error } = await supabase.from('courses').insert([{ code }]);
        
        if (error) {
            if (error.code === '23505') alert("Course already exists.");
            else throw error;
        } else {
            setAvailableCourses(prev => [...prev, code].sort());
            setNewCourseCode("");
        }
    } catch (err) {
        alert("Error adding course: " + err.message);
    } finally {
        setCourseLoading(false);
    }
  };

  const handleDeleteCourse = async (codeToDelete) => {
    if (!confirm(`Are you sure you want to delete ${codeToDelete}?`)) return;
    
    try {
        const { error } = await supabase.from('courses').delete().eq('code', codeToDelete);
        if (error) throw error;
        setAvailableCourses(prev => prev.filter(c => c !== codeToDelete));
    } catch (err) {
        alert("Failed to delete course. It might be in use.");
    }
  };

  const handleDownloadTemplate = () => {
    // Using Papa.unparse ensures fields with commas (like Name) are automatically wrapped in quotes
    // so Excel reads "DOE, JOHN SMITH" as one column, not two.
    const csvContent = Papa.unparse({
      fields: ["STUDENT ID", "NAME", "SEMESTER", "COURSE"],
      data: [
        ["03-01-2425-XXXXX", "DOE, JOHN SMITH", "Y1S2", "Bachelor of Science in Information Technology"]
      ]
    });
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    link.setAttribute("download", "enrollment_summary_template.csv");
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto w-full">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Students & Enrollment</h1>
                <p className="text-sm text-slate-500">Database of registered students for transaction billing.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Header */}
            <div className="p-5 border-b flex flex-col md:flex-row justify-between items-center bg-white rounded-t-xl gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div>
                      <h2 className="text-xl font-bold text-slate-800">Enrollment Summary</h2>
                      <p className="text-xs text-slate-500 font-medium">Database of registered students for transaction billing</p>
                  </div>
                    {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                        <div className="flex gap-2">
                            <button 
                                onClick={handleDownloadTemplate}
                                className="btn btn-sm btn-outline btn-ghost border-slate-200 text-slate-600 px-4 normal-case hover:bg-slate-50"
                                title="Download CSV Template"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Template
                            </button>
                            <button 
                                onClick={() => setIsImportModalOpen(true)}
                                className="btn btn-sm btn-primary px-4 normal-case"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                </svg>
                                Import CSV
                            </button>
                            <button 
                                onClick={() => setShowCourseModal(true)}
                                className="btn btn-sm btn-outline btn-ghost border-slate-200 text-slate-600 px-4 normal-case hover:bg-slate-50"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1">
                                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                </svg>
                                Courses
                            </button>
                        </div>
                    )}
                </div>

                <div className="relative w-full md:w-72">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input 
                        type="text" 
                        placeholder="Search Name or ID..." 
                        className="input input-bordered input-sm w-full pl-10 bg-slate-50 border-slate-200 focus:bg-white transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto min-h-[500px]">
                <table className="table w-full table-pin-rows">
                    <thead className="bg-gray-100 text-gray-600">
                        <tr>
                            <th>Student ID</th>
                            <th>Full Name</th>
                            <th>Course</th>
                            <th>Year Level</th>
                            {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && <th className="text-right">Action</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={['ADMIN', 'SUPER_ADMIN'].includes(userRole) ? 5 : 4} className="text-center py-12 text-slate-400 font-medium">Loading Data...</td></tr>
                        ) : students.length === 0 ? (
                            <tr><td colSpan={['ADMIN', 'SUPER_ADMIN'].includes(userRole) ? 5 : 4} className="text-center py-12 text-slate-400 font-medium">No students found.</td></tr>
                        ) : (
                            students.map(s => (
                                <tr key={s.id || s.student_id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="font-mono font-bold text-[11px] text-slate-500 whitespace-normal break-all min-w-[120px]">
                                        {s.student_id}
                                    </td>
                                    <td className="font-semibold text-slate-700 whitespace-normal break-all min-w-[150px]">
                                        {s.name}
                                    </td>
                                    <td>
                                        <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-500 whitespace-normal break-all leading-tight">
                                            {s.course || "N/A"}
                                        </span>
                                    </td>
                                    <td>
                                        {s.year_level ? (
                                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-tighter border border-slate-200 px-1.5 py-0.5 rounded whitespace-normal break-all inline-block">
                                                {s.year_level}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>
                                    {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                                        <td className="text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => handleEditClick(s)}
                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors tooltip tooltip-left"
                                                    data-tip="Edit Student"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
                    <Pagination 
                        totalCount={totalCount}
                        itemsPerPage={ITEMS_PER_PAGE}
                        currentPage={currentPage}
                        onPageChange={(p) => setCurrentPage(p)}
                        loading={loading}
                    />
          </div>
        </div>
      </main>

      {/* Edit Modal */}
      {editingStudent && (
        <div className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg text-gray-700 border-b pb-2 mb-4">Edit Student Details</h3>
                
                <form onSubmit={handleUpdate} className="flex flex-col gap-4">
                    
                    {/* Student ID - Read Only */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text text-xs uppercase font-bold text-gray-500">Student ID</span>
                        </label>
                        <input 
                            type="text" 
                            value={editingStudent.student_id} 
                            disabled 
                            className="input input-bordered w-full bg-gray-100 font-mono font-bold text-gray-500" 
                        />
                    </div>
                    
                    {/* Name Input */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text text-xs uppercase font-bold text-gray-500">Full Name</span>
                        </label>
                        <LimitedInput 
                            type="text" 
                            required
                            maxLength={150}
                            className="input input-bordered w-full font-semibold text-gray-700 uppercase" 
                            value={editForm.name}
                            onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Course Dropdown */}
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text text-xs uppercase font-bold text-gray-500">Course</span>
                            </label>
                            <select 
                                className="select select-bordered w-full h-auto min-h-[3rem] py-2 leading-tight whitespace-normal break-all max-w-full"
                                value={editForm.course}
                                onChange={(e) => setEditForm({...editForm, course: e.target.value})}
                            >
                                <option value="" disabled>Select Course</option>
                                {availableCourses.map(c => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Year Input */}
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text text-xs uppercase font-bold text-gray-500">Year / Sem</span>
                            </label>
                            <LimitedInput 
                                type="text" 
                                maxLength={20}
                                className="input input-bordered w-full uppercase" 
                                value={editForm.year_level}
                                onChange={(e) => setEditForm({...editForm, year_level: e.target.value})}
                                placeholder="e.g. Y1S2"
                            />
                        </div>
                    </div>

                    <div className="modal-action mt-6">
                        <button type="button" onClick={() => setEditingStudent(null)} className="btn btn-ghost">Cancel</button>
                        <button type="submit" className={`btn btn-primary ${saving ? 'loading' : ''}`}>Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Course Management Modal */}
      {showCourseModal && (
        <div className="modal modal-open">
            <div className="modal-box">
                <div className="flex justify-between items-center border-b pb-2 mb-4">
                    <h3 className="font-bold text-lg text-gray-700">Manage Courses</h3>
                    <button onClick={() => setShowCourseModal(false)} className="btn btn-sm btn-circle btn-ghost">✕</button>
                </div>

                {/* Add New Course Form */}
                <form onSubmit={handleAddCourse} className="flex gap-2 mb-6">
                    <LimitedInput 
                        type="text" 
                        maxLength={200}
                        placeholder="Enter Course" 
                        className="input input-bordered w-full uppercase"
                        value={newCourseCode}
                        onChange={(e) => setNewCourseCode(e.target.value)}
                    />
                    <button type="submit" disabled={courseLoading} className="btn btn-primary">
                        {courseLoading ? "..." : "Add"}
                    </button>
                </form>

                {/* List of Courses */}
                <div className="h-64 overflow-y-auto border rounded-lg">
                    <table className="table table-pin-rows w-full">
                        <thead>
                            <tr className="bg-gray-100">
                                <th>Course</th>
                                <th className="text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {availableCourses.map(code => (
                                <tr key={code} className="hover">
                                    <td className="font-bold text-gray-600">{code}</td>
                                    <td className="text-right">
                                        <button 
                                            onClick={() => handleDeleteCourse(code)}
                                            className="btn btn-xs btn-ghost text-red-500"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {availableCourses.length === 0 && (
                                <tr><td colSpan="2" className="text-center text-gray-400 py-4">No courses found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box relative">
            
            {/* Loading Overlay */}
            {importLoading ? (
               <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <span className="loading loading-spinner loading-lg text-primary"></span>
                  <div className="text-center">
                    <h3 className="font-bold text-lg text-gray-700">Importing Data...</h3>
                    <p className="text-sm text-gray-500">Please do not close this window.</p>
                  </div>
               </div>
            ) : (
               /* Standard Form */
               <>
                <h3 className="font-bold text-lg text-gray-700 mb-4">Import Student CSV</h3>
                <p className="text-xs text-gray-500 mb-4">
                    CSV Format must contain headers: <strong>STUDENT ID, NAME, SEMESTER, COURSE</strong><br/>
                    Existing IDs will be updated. New IDs will be added.
                </p>
                
                <input 
                    type="file" 
                    accept=".csv"
                    onChange={handleStudentImport}
                    className="file-input file-input-bordered w-full file-input-sm 
                               file:bg-blue-600 file:text-white file:border-none hover:file:bg-blue-700 transition-all" 
                />

                <div className="modal-action">
                    <button className="btn btn-ghost" onClick={() => setIsImportModalOpen(false)}>Cancel</button>
                </div>
               </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}