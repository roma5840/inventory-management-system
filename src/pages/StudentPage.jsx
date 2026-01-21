import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Navbar from "../components/Navbar";

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
  const [editForm, setEditForm] = useState({ name: "", course: "" });
  const [saving, setSaving] = useState(false);

  // 1. Debounce Search Input
  useEffect(() => {
    const timer = setTimeout(() => {
        setDebouncedTerm(searchTerm);
        setPage(1); // Reset to page 1 on search change
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 2. Fetch Data & Realtime Subscription
  useEffect(() => {
    const fetchStudents = async () => {
        setLoading(true);
        let query = supabase.from('students').select('*', { count: 'exact' });

        if (debouncedTerm.trim()) {
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

    // A. Database Changes (e.g., TransactionForm adds a new student)
    const dbChannel = supabase.channel('student-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => {
            fetchStudents();
        })
        .subscribe();

    // B. App Broadcasts (General refreshes)
    const appChannel = supabase.channel('app_updates')
        .on('broadcast', { event: 'inventory_update' }, () => {
            fetchStudents();
        })
        .subscribe();

    return () => {
        supabase.removeChannel(dbChannel);
        supabase.removeChannel(appChannel);
    };
  }, [debouncedTerm, page]);


  // 3. Handlers
  const handleEditClick = (student) => {
    setEditingStudent(student);
    setEditForm({ name: student.name, course: student.course });
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
                last_updated: new Date() // FIXED: Column name matches your SQL schema
            })
            .eq('student_id', editingStudent.student_id);

        if (error) throw error;
        
        setEditingStudent(null);
        // Realtime listener will auto-refresh UI
    } catch (err) {
        alert("Update failed: " + err.message);
    } finally {
        setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      
      <main className="container mx-auto px-4 max-w-5xl">
        <div className="card bg-base-100 shadow-xl">
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                <h2 className="card-title text-xl text-gray-700">Student Registry</h2>
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
                                        <span className="badge badge-ghost badge-sm">{s.course || "N/A"}</span>
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
                    
                    {/* Name Input - Stacked Below Label */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text text-xs uppercase font-bold text-gray-500">Full Name</span>
                        </label>
                        <input 
                            type="text" 
                            required
                            className="input input-bordered w-full font-semibold text-gray-700" 
                            value={editForm.name}
                            onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                            placeholder="Enter full name..."
                        />
                    </div>

                    {/* Course Input - Stacked Below Label */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text text-xs uppercase font-bold text-gray-500">Course / Year</span>
                        </label>
                        <input 
                            type="text" 
                            className="input input-bordered w-full" 
                            value={editForm.course}
                            onChange={(e) => setEditForm({...editForm, course: e.target.value})}
                            placeholder="e.g. BSIT 4-A"
                        />
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