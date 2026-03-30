import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import Papa from "papaparse"; 
import Sidebar from "../components/Sidebar";
import Pagination from "../components/Pagination";
import LimitedInput from "../components/LimitedInput";
import Toast from "../components/Toast";
import { useNavigate } from "react-router-dom";
import DeleteModal from "../components/DeleteModal";

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

  const [toast, setToast] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const [deletingCourse, setDeletingCourse] = useState(null);
  const [deleteCourseLoading, setDeleteCourseLoading] = useState(false);

  const navigate = useNavigate();

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
        if (debouncedTerm !== searchTerm) {
            setDebouncedTerm(searchTerm);
            setCurrentPage(1); 
        }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, debouncedTerm]);

  // 2. Fetch Students (The Search Logic)
  useEffect(() => {
    let ignore = false; // Flag to prevent race conditions

    const fetchStudents = async () => {
        setLoading(true);
        // OPTIMIZATION: Select specific columns to reduce DB sorting memory and network payload
        let query = supabase
            .from('students')
            .select('student_id, name, course, year_level', { count: 'exact' });

        if (debouncedTerm.trim()) {
            // '_' is a SQL wildcard for a single character, preventing syntax breaks
            const safeTerm = debouncedTerm.replace(/,/g, '_');
            query = query.or(`name.ilike.%${safeTerm}%,student_id.ilike.%${safeTerm}%`);
        } else {
            query = query.order('name', { ascending: true });
        }

        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        const { data, count, error } = await query.range(from, to);
        
        // If the query finishes but a new search has already started, discard these stale results
        if (ignore) return; 
        
        if (error) {
            console.error("Error fetching students:", error);
        } else {
            setStudents(data || []);
            if (count !== null) setTotalCount(count);
        }
        
        setLoading(false);
    };

    fetchStudents();

    // OPTIMIZATION: Added burst-protection from InventoryTable to prevent 
    // network lockups during bulk CSV imports or rapid edits
    let changeCount = 0;
    let burstResetTimer = null;
    let debounceTimer = null;

    const dbChannel = supabase.channel('student-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => {
            changeCount++;
            
            if (burstResetTimer) clearTimeout(burstResetTimer);
            burstResetTimer = setTimeout(() => {
                changeCount = 0;
            }, 300);
            
            if (changeCount <= 2) {
                fetchStudents();
            } else {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    fetchStudents();
                    changeCount = 0; 
                }, 500);
            }
        })
        .subscribe();

    return () => {
        ignore = true; // Mark this fetch instance as outdated
        if (burstResetTimer) clearTimeout(burstResetTimer);
        if (debounceTimer) clearTimeout(debounceTimer);
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
        const { data: { session } } = await supabase.auth.getSession();
        
        const res = await fetch('/api/manage-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({ action: 'UPDATE', student_id: editingStudent.student_id, payload: editForm })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to update student");
        
        setStudents(prev => prev.map(s => 
            s.student_id === editingStudent.student_id 
                ? { ...s, name: editForm.name.toUpperCase(), course: editForm.course || null, year_level: editForm.year_level.toUpperCase() || null } 
                : s
        ));
        
        setToast({ 
            message: "Student Updated", 
            subMessage: `${editForm.name}'s records have been saved.`, 
            type: "success" 
        });

        await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'inventory_update', payload: {} 
        });

        setEditingStudent(null);
    } catch (err) {
        setToast({ message: "Update Failed", subMessage: err.message, type: "error" });
    } finally {
        setSaving(false);
    }
  };

  const handleStudentImport = (e) => {
    e.preventDefault();
    const file = e.target.files[0];
    if (!file) return;

    setImportLoading(true);

    const REQUIRED_HEADERS = ["STUDENT ID", "NAME", "SEMESTER", "COURSE"];

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const headers = results.meta.fields || [];
          
          const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
          const extraHeaders = headers.filter(h => !REQUIRED_HEADERS.includes(h));

          if (missingHeaders.length > 0 || extraHeaders.length > 0) {
              let errorMsg = "CSV Format Error. ";
              if (missingHeaders.length > 0) errorMsg += `Missing/Invalid: [${missingHeaders.join(', ')}]. `;
              if (extraHeaders.length > 0) errorMsg += `Unknown headers: [${extraHeaders.join(', ')}]. `;
              throw new Error(errorMsg + "Please ensure exact match with the template (case-sensitive, exact spaces).");
          }

          const rows = results.data;
          if (rows.length === 0) throw new Error("No data found in the CSV.");

          const validationErrors = [];

          const sanitize = (str) => {
              if (typeof str !== 'string') return str !== undefined && str !== null ? String(str).trim() : null;
              const clean = str.trim();
              return /^[=+\-@]/.test(clean) ? "'" + clean : clean;
          };

          const isExcelError = (val) => {
              if (!val) return false;
              const upper = String(val).trim().toUpperCase();
              const excelErrors = [
                  '#N/A', 'N/A', '#REF!', '#DIV/0!', '#VALUE!', 
                  '#NAME?', '#NUM!', '#NULL!', '#CALC!', '#SPILL!', '-'
              ];
              return excelErrors.includes(upper);
          };

          const rawRows = rows.map((r, index) => {
              let rawId = sanitize(r['STUDENT ID']);
              const student_id = (!rawId || isExcelError(rawId)) ? null : rawId;
              
              let rawName = sanitize(r['NAME']);
              const name = (!rawName || isExcelError(rawName)) ? null : rawName.toUpperCase();
              
              let rawSem = sanitize(r['SEMESTER']);
              const year_level = (!rawSem || isExcelError(rawSem)) ? null : rawSem.toUpperCase();

              let rawCourse = sanitize(r['COURSE']);
              const course = (!rawCourse || isExcelError(rawCourse)) ? null : rawCourse.toUpperCase();

              const rowId = student_id || `Row ${index + 2}`;
              let rowValid = true;

              if (!student_id) { validationErrors.push(`[${rowId}] Missing Student ID. Row Skipped.`); rowValid = false; }
              else if (student_id.length > 50) { validationErrors.push(`[${rowId}] Student ID exceeds 50 characters.`); rowValid = false; }

              if (!name) { validationErrors.push(`[${rowId}] Missing Name. Row Skipped.`); rowValid = false; }
              else if (name.length > 150) { validationErrors.push(`[${rowId}] Name exceeds 150 characters.`); rowValid = false; }

              if (course && course.length > 200) { validationErrors.push(`[${rowId}] Course exceeds 200 characters.`); rowValid = false; }
              if (year_level && year_level.length > 20) { validationErrors.push(`[${rowId}] Semester/Year exceeds 20 characters.`); rowValid = false; }

              if (!rowValid) return null;
              return { student_id, name, course, year_level };
          }).filter(Boolean);

          if (rawRows.length === 0 && validationErrors.length === 0) throw new Error("Could not parse rows.");

          const uniqueMap = new Map();
          rawRows.forEach((r) => {
              if (uniqueMap.has(r.student_id)) {
                  validationErrors.push(`[${r.student_id}] Duplicate ID in CSV. Merged automatically.`);
              }
              uniqueMap.set(r.student_id, r);
          });

          const cleanRows = Array.from(uniqueMap.values());
          const { data: { session } } = await supabase.auth.getSession();

          // CONCURRENT BATCHING
          const CHUNK_SIZE = 500;
          const MAX_CONCURRENT = 3; 
          let totalInserted = 0, totalUpdated = 0, totalUnchanged = 0;
          const allErrors = [...validationErrors];
          
          // Generate single batch identifier for the database audit log Upsert
          const batchId = crypto.randomUUID();

          const chunks = [];
          for (let i = 0; i < cleanRows.length; i += CHUNK_SIZE) {
              chunks.push(cleanRows.slice(i, i + CHUNK_SIZE));
          }

          // Process chunks concurrently in batches of 3
          for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
              const batch = chunks.slice(i, i + MAX_CONCURRENT);
              const promises = batch.map(async (chunk, index) => {
                  const res = await fetch('/api/manage-students', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                      body: JSON.stringify({ action: 'IMPORT', rows: chunk, batch_id: batchId })
                  });
                  
                  const result = await res.json();
                  if (!res.ok) throw new Error(result.error || `Failed at chunk ${i + index + 1}`);
                  return result.importResult;
              });

              // Send up to 3 batches (1500 rows) at the exact same time
              const results = await Promise.all(promises);
              
              results.forEach(res => {
                  totalInserted += res.inserted;
                  totalUpdated += res.updated;
                  totalUnchanged += res.unchanged;
                  if (res.errors) allErrors.push(...res.errors);
              });
          }

          setImportResult({ inserted: totalInserted, updated: totalUpdated, unchanged: totalUnchanged, errors: allErrors });
          
          // Refresh course list incase new ones were added
          const { data: newCourses } = await supabase.from('courses').select('code').order('code');
          if (newCourses) setAvailableCourses(newCourses.map(c => c.code));

          setIsImportModalOpen(false);
          
          await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'inventory_update', payload: {} 
          });

        } catch (err) {
          setToast({ message: "Import Failed", subMessage: err.message, type: "error" });
        } finally {
          setImportLoading(false);
          e.target.value = null;
        }
      },
      error: (error) => {
        setToast({ message: "Parsing Error", subMessage: error.message, type: "error" });
        setImportLoading(false);
        e.target.value = null;
      }
    });
  };

  const handleAddCourse = async (e) => {
    e.preventDefault();
    if (!newCourseCode.trim()) return;
    setCourseLoading(true);

    try {
        const code = newCourseCode.trim().toUpperCase();
        const { data: { session } } = await supabase.auth.getSession();
        
        const res = await fetch('/api/manage-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({ action: 'CREATE_COURSE', code })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to add course");

        setAvailableCourses(prev => [...prev, code].sort());
        setNewCourseCode("");
        setToast({ message: "Course Added", subMessage: `${code} has been added.`, type: "success" });
    } catch (err) {
        setToast({ message: "Error adding course", subMessage: err.message, type: "error" });
    } finally {
        setCourseLoading(false);
    }
  };

  const handleDeleteCourse = (code) => {
    setDeletingCourse(code);
  };

  const confirmDeleteCourse = async () => {
    if (!deletingCourse) return;
    setDeleteCourseLoading(true);
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const res = await fetch('/api/manage-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({ action: 'DELETE_COURSE', code: deletingCourse })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to delete course");

        setAvailableCourses(prev => prev.filter(c => c !== deletingCourse));
        setToast({ message: "Course Deleted", type: "delete" });
        setDeletingCourse(null);
    } catch (err) {
        setToast({ message: "Action Failed", subMessage: err.message, type: "error" });
    } finally {
        setDeleteCourseLoading(false);
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
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">STUDENTS & ENROLLMENT</h1>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Database of registered students for transaction billing.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Header */}
            <div className="p-6 border-b border-slate-200 flex flex-col xl:flex-row justify-between items-center bg-white rounded-t-xl gap-4">
              <div className="flex flex-col lg:flex-row items-center gap-6 w-full xl:w-auto">
                <div className="text-center lg:text-left">
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight uppercase">ENROLLMENT SUMMARY</h2>
                </div>
                
                {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
                    <button 
                        onClick={handleDownloadTemplate}
                        className="btn btn-sm bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 rounded-lg px-4 gap-2 h-8 normal-case"
                        title="Download CSV Template"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        <span className="text-[11px] font-bold uppercase tracking-widest">Template</span>
                    </button>
                    <button 
                        onClick={() => setIsImportModalOpen(true)}
                        className="btn btn-sm btn-primary rounded-lg px-4 gap-2 h-8 normal-case"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        <span className="text-[11px] font-bold uppercase tracking-widest">Import CSV</span>
                    </button>
                    <button 
                        onClick={() => setShowCourseModal(true)}
                        className="btn btn-sm bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 rounded-lg px-4 gap-2 h-8 normal-case"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                        </svg>
                        <span className="text-[11px] font-bold uppercase tracking-widest">Courses</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="relative w-full xl:w-72">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input 
                    type="text" 
                    placeholder="Search students..." 
                    className="input input-sm w-full pl-9 bg-slate-50 border-slate-200 focus:bg-white transition-all text-xs rounded-lg h-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto min-h-[500px]">
                <table className="table w-full table-pin-rows">
                    <thead>
                        <tr className="bg-slate-50/80 backdrop-blur-sm text-slate-500 uppercase text-[11px] tracking-wider border-b border-slate-200">
                            <th className="bg-slate-50/80">Student ID</th>
                            <th className="bg-slate-50/80">Full Name</th>
                            <th className="bg-slate-50/80">Course</th>
                            <th className="bg-slate-50/80">Year Level</th>
                            {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && <th className="text-right bg-slate-50/80">Action</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={['ADMIN', 'SUPER_ADMIN'].includes(userRole) ? 5 : 4} className="text-center py-20"><span className="loading loading-spinner loading-lg text-slate-300"></span></td></tr>
                        ) : students.length === 0 ? (
                            <tr><td colSpan={['ADMIN', 'SUPER_ADMIN'].includes(userRole) ? 5 : 4} className="text-center py-12 text-slate-400 font-medium">No students found.</td></tr>
                        ) : (
                            students.map(s => (
                                <tr key={s.id || s.student_id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="max-w-[150px] min-w-[120px]">
                                        <button 
                                            onClick={() => navigate(`/student/${s.student_id}`)}
                                            className="font-mono text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 whitespace-normal break-all text-left"
                                            title="View Student Record"
                                        >
                                            {s.student_id}
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                                                <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                            </svg>
                                        </button>
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
          <div className="modal-box max-w-xl border border-slate-200 shadow-2xl p-0 overflow-hidden">
            <div className="p-6 border-b bg-slate-50">
                <h3 className="font-bold text-lg text-slate-800">Edit Student Details</h3>
                <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-wider">Modify student records and course assignment.</p>
            </div>
            
            <form onSubmit={handleUpdate} className="p-6 flex flex-col gap-4">
                
                {/* Student ID - Read Only */}
                <div className="form-control w-full">
                    <label className="label">
                        <span className="label-text text-xs uppercase font-bold text-gray-500">Student ID *</span>
                    </label>
                    <input 
                        type="text" 
                        value={editingStudent.student_id} 
                        disabled 
                        className="input input-bordered input-sm font-mono font-bold text-blue-800 bg-slate-50 w-full" 
                    />
                </div>
                
                {/* Name Input */}
                <div className="form-control w-full">
                    <label className="label">
                        <span className="label-text text-xs uppercase font-bold text-gray-500">Full Name *</span>
                    </label>
                    <LimitedInput 
                        type="text" 
                        required
                        maxLength={150}
                        showCounter={true}
                        className="input input-bordered w-full uppercase bg-slate-50 focus:bg-white" 
                        value={editForm.name}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                        disabled={saving}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Course Dropdown */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text text-xs uppercase font-bold text-gray-500">Course</span>
                        </label>
                        <select 
                            className="select select-bordered w-full h-auto min-h-[3rem] py-2 leading-tight whitespace-normal break-all max-w-full bg-slate-50 focus:bg-white"
                            value={editForm.course}
                            onChange={(e) => setEditForm({...editForm, course: e.target.value})}
                            disabled={saving}
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
                            showCounter={true}
                            className="input input-bordered w-full uppercase bg-slate-50 focus:bg-white" 
                            value={editForm.year_level}
                            onChange={(e) => setEditForm({...editForm, year_level: e.target.value})}
                            placeholder="e.g. Y1S2"
                            disabled={saving}
                        />
                    </div>
                </div>

                <div className="modal-action mt-2 pt-4 border-t border-slate-100">
                    <button 
                        type="button" 
                        onClick={() => setEditingStudent(null)} 
                        className="btn btn-ghost text-slate-500 normal-case"
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        className="btn btn-primary px-8 normal-case min-w-[140px]" 
                        disabled={saving}
                    >
                        {saving ? (
                            <span className="loading loading-spinner loading-sm"></span>
                        ) : (
                            "Save Changes"
                        )}
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* Course Management Modal */}
      {showCourseModal && (
        <div className="modal modal-open">
            {/* Overlay to catch clicks outside while loading */}
            <div 
                className={`modal-box border border-slate-200 shadow-2xl p-0 overflow-hidden bg-white ${courseLoading ? 'pointer-events-none select-none' : ''}`}
            >
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800">Manage Courses</h3>
                        <p className="text-xs text-slate-500 font-medium">Add or remove valid courses</p>
                    </div>
                    <button 
                        onClick={() => {
                            if (!courseLoading) {
                                setShowCourseModal(false);
                                setNewCourseCode("");
                            }
                        }} 
                        className={`btn btn-sm btn-circle btn-ghost ${courseLoading ? 'opacity-0' : ''}`}
                        disabled={courseLoading}
                    >
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <form onSubmit={handleAddCourse} className="flex gap-2">
                        <LimitedInput 
                            type="text" 
                            maxLength={200}
                            showCounter={!courseLoading}
                            placeholder={courseLoading ? "Processing..." : "Enter Course"}
                            className="input input-bordered w-full uppercase font-semibold h-11 disabled:bg-slate-100 disabled:text-slate-400"
                            value={newCourseCode}
                            onChange={(e) => setNewCourseCode(e.target.value)}
                            disabled={courseLoading}
                        />
                        <button 
                            type="submit" 
                            disabled={courseLoading || !newCourseCode.trim()} 
                            className="btn btn-primary h-11 px-6 min-w-[100px]"
                        >
                            {courseLoading ? (
                                <span className="flex items-center gap-2">
                                    <span className="loading loading-spinner loading-xs"></span>
                                </span>
                            ) : "Add"}
                        </button>
                    </form>

                    <div className="max-h-80 overflow-y-auto border border-slate-100 rounded-xl bg-white shadow-inner">
                        <table className="table table-pin-rows w-full">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="text-[10px] uppercase text-slate-400 py-3">Course Code</th>
                                    <th className="text-right text-[10px] uppercase text-slate-400 py-3">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {availableCourses.map(code => (
                                    <tr key={code} className={`hover:bg-slate-50/50 group transition-colors ${courseLoading ? 'opacity-50' : ''}`}>
                                        <td className="font-bold text-slate-700 text-sm py-3">{code}</td>
                                        <td className="text-right py-3">
                                            <button 
                                                onClick={() => handleDeleteCourse(code)}
                                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                                disabled={courseLoading}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {availableCourses.length === 0 && (
                                    <tr><td colSpan="2" className="text-center text-gray-400 py-8">No courses found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
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

      {/* Import Success Summary Modal */}
      {importResult && (
        <div className="modal modal-open">
            <div className="modal-box max-w-sm text-center p-8 border border-slate-200 shadow-2xl">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${importResult.errors?.length > 0 ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {importResult.errors?.length > 0 ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                </div>
                <h3 className="font-bold text-xl text-slate-800">
                    {importResult.errors?.length > 0 ? "Import Completed with Issues" : "Import Successful"}
                </h3>
                <p className="text-sm text-slate-500 mb-6">Database has been updated with CSV data.</p>
                
                <div className="grid grid-cols-3 gap-2 mb-6">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="text-xl font-bold text-emerald-600">{importResult.inserted}</div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">New</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="text-xl font-bold text-blue-600">{importResult.updated}</div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Updated</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="text-xl font-bold text-slate-400">{importResult.unchanged}</div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Match</div>
                    </div>
                </div>

                {importResult.errors && importResult.errors.length > 0 && (
                    <div className="mb-6 text-left bg-red-50 border border-red-100 rounded-lg p-3 max-h-32 overflow-y-auto">
                        <h4 className="text-xs font-bold text-red-700 uppercase mb-2">Errors Encountered:</h4>
                        <ul className="text-[10px] text-red-600 space-y-1 list-disc pl-4">
                            {importResult.errors.map((err, idx) => (
                                <li key={idx}>{err}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <button onClick={() => setImportResult(null)} className="btn btn-primary w-full shadow-lg">Done</button>
            </div>
        </div>
      )}

      <DeleteModal 
          isOpen={!!deletingCourse}
          onClose={() => setDeletingCourse(null)}
          onConfirm={confirmDeleteCourse}
          title="Delete Course"
          itemName={deletingCourse}
          warningText="This action cannot be undone. The system will BLOCK this deletion if the course is currently assigned to any student. You must reassign or remove all students linked to this course before it can be wiped from the database."
          isLoading={deleteCourseLoading}
      />

      {/* Notifications */}
      {toast && (
        <Toast 
            message={toast.message} 
            subMessage={toast.subMessage} 
            type={toast.type} 
            onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
}