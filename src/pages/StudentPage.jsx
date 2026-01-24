import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import Navbar from "../components/Navbar";
import Papa from "papaparse"; // Import CSV Parser

export default function StudentPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 30;

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
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

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
        setPage(1); 
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 2. Fetch Students (The Search Logic)
  useEffect(() => {
    const fetchStudents = async () => {
        setLoading(true);
        let query = supabase.from('students').select('*', { count: 'exact' });

        if (debouncedTerm.trim()) {
            // Search by Name or ID
            query = query.or(`name.ilike.%${debouncedTerm}%,student_id.ilike.%${debouncedTerm}%`);
        } else {
            query = query.order('name', { ascending: true });
        }

        const from = (page - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        const { data, error } = await query.range(from, to);
        
        if (error) console.error("Error fetching students:", error);
        else setStudents(data || []);
        
        setLoading(false);
    };

    fetchStudents();

    // Listeners for realtime updates
    const dbChannel = supabase.channel('student-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, fetchStudents)
        .subscribe();

    const appChannel = supabase.channel('app_updates')
        .on('broadcast', { event: 'inventory_update' }, fetchStudents)
        .subscribe();

    return () => {
        supabase.removeChannel(dbChannel);
        supabase.removeChannel(appChannel);
    };
  }, [debouncedTerm, page]);


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
                name: editForm.name, 
                course: editForm.course,
                year_level: editForm.year_level,
                last_updated: new Date()
            })
            .eq('student_id', editingStudent.student_id);

        if (error) throw error;
        
        setStudents(prev => prev.map(s => 
            s.student_id === editingStudent.student_id 
                ? { ...s, name: editForm.name, course: editForm.course, year_level: editForm.year_level } 
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

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // 1. Map CSV Headers to DB Columns
          const formattedData = results.data
            .filter(row => row['STUDENT ID'] && row['NAME'])
            .map(row => ({
              student_id: row['STUDENT ID'].trim(),
              name: row['NAME'].trim().toUpperCase(),
              course: row['COURSE'] ? row['COURSE'].trim().toUpperCase() : '',
              year_level: row['SEMESTER'] ? row['SEMESTER'].trim().toUpperCase() : '', // Map Semester -> Year Level
              last_updated: new Date()
            }));

          if (formattedData.length === 0) throw new Error("No valid data found in CSV.");

          // 2. Extract Unique Courses and Update 'courses' table
          const uniqueCourses = [...new Set(formattedData.map(d => d.course).filter(Boolean))];
          const courseInserts = uniqueCourses.map(c => ({ code: c }));
          
          // Upsert courses (ignore duplicates)
          if (courseInserts.length > 0) {
             await supabase.from('courses').upsert(courseInserts, { onConflict: 'code' });
             // Refresh local course list
             setAvailableCourses(prev => [...new Set([...prev, ...uniqueCourses])].sort());
          }

          // 3. Perform Batch Upsert for Students
          const { error } = await supabase
            .from('students')
            .upsert(formattedData, { onConflict: 'student_id' });

          if (error) throw error;

          alert(`Successfully processed ${formattedData.length} students.`);
          if (fileInputRef.current) fileInputRef.current.value = "";
          
        } catch (err) {
          alert("Import Failed: " + err.message);
          console.error(err);
        } finally {
          setImporting(false);
        }
      },
      error: (error) => {
        alert("CSV Parsing Error: " + error.message);
        setImporting(false);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      
      <main className="container mx-auto px-4 max-w-5xl">
        <div className="card bg-base-100 shadow-xl">
            {/* Header */}
            <div className="p-4 border-b flex flex-col md:flex-row justify-between items-center bg-gray-50 rounded-t-xl gap-4">
                <div className="flex items-center gap-2">
                    <h2 className="card-title text-xl text-gray-700">Enrollment Summary</h2>
                    
                    {/* Hidden File Input */}
                    <input 
                        type="file" 
                        accept=".csv"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden" 
                    />
                    
                    {/* Import Button */}
                    <button 
                        onClick={() => fileInputRef.current.click()}
                        disabled={importing}
                        className="btn btn-sm btn-outline btn-success gap-2"
                    >
                        {importing ? (
                            <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                        )}
                        Import CSV
                    </button>
                </div>

                <input 
                    type="text" 
                    placeholder="Search Name or ID..." 
                    className="input input-bordered input-sm w-full max-w-xs bg-white"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Table */}
            <div className="overflow-x-auto min-h-[500px]">
                <table className="table w-full table-pin-rows">
                    <thead className="bg-gray-100 text-gray-600">
                        <tr>
                            <th>Student ID</th>
                            <th>Full Name</th>
                            <th>Course / Year</th>
                            <th className="text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="4" className="text-center py-10">Loading Data...</td></tr>
                        ) : students.length === 0 ? (
                            <tr><td colSpan="4" className="text-center py-10 text-gray-400">No students found.</td></tr>
                        ) : (
                            students.map(s => (
                                <tr key={s.id || s.student_id} className="hover">
                                    <td className="font-mono font-bold text-gray-500">{s.student_id}</td>
                                    <td className="font-semibold text-gray-700">{s.name}</td>
                                    <td>
                                        <div className="flex gap-2">
                                            <span className="badge badge-ghost badge-sm">{s.course || "N/A"}</span>
                                            {s.year_level && <span className="badge badge-outline badge-sm">{s.year_level}</span>}
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        <button 
                                            onClick={() => handleEditClick(s)}
                                            className="btn btn-square btn-xs btn-ghost text-blue-500"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                                <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t flex justify-between items-center bg-gray-50 rounded-b-xl">
                <span className="text-xs text-gray-500 font-bold">PAGE {page}</span>
                <div className="flex gap-2">
                    <button 
                        className="btn btn-xs btn-outline bg-white" 
                        disabled={page === 1 || loading}
                        onClick={() => setPage(p => p - 1)}
                    >
                        « Prev
                    </button>
                    <button 
                        className="btn btn-xs btn-outline bg-white" 
                        disabled={students.length < ITEMS_PER_PAGE || loading}
                        onClick={() => setPage(p => p + 1)}
                    >
                        Next »
                    </button>
                </div>
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
                        <input 
                            type="text" 
                            required
                            className="input input-bordered w-full font-semibold text-gray-700" 
                            value={editForm.name}
                            onChange={(e) => setEditForm({...editForm, name: e.target.value.toUpperCase()})}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Course Dropdown */}
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text text-xs uppercase font-bold text-gray-500">Course</span>
                            </label>
                            <select 
                                className="select select-bordered w-full"
                                value={editForm.course}
                                onChange={(e) => setEditForm({...editForm, course: e.target.value})}
                            >
                                <option value="" disabled>Select Course</option>
                                {availableCourses.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {/* Year Input */}
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text text-xs uppercase font-bold text-gray-500">Year / Sem</span>
                            </label>
                            <input 
                                type="text" 
                                className="input input-bordered w-full" 
                                value={editForm.year_level}
                                onChange={(e) => setEditForm({...editForm, year_level: e.target.value.toUpperCase()})}
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
    </div>
  );
}