import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Gate 1: Transport Auth
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = authHeader.replace('Bearer ', '');

  // DB Client (Service Role bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  // Gate 2: Verify Administrative Privileges
  const { data: callerProfile } = await supabaseAdmin
    .from('authorized_users')
    .select('id, full_name, role, status')
    .eq('auth_uid', user.id)
    .single();

  if (!callerProfile || callerProfile.status !== 'REGISTERED' || !['ADMIN', 'SUPER_ADMIN'].includes(callerProfile.role)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
  }

  // Helper: Audit Logger
  const logAudit = async (actionType, entityId, entityName, oldValues = null, newValues = null) => {
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: user.id,
      actor_name: callerProfile.full_name || user.email,
      action_type: actionType,
      entity_type: 'STUDENTS',
      entity_id: entityId,
      entity_name: entityName,
      old_values: oldValues,
      new_values: newValues
    });
  };

  const { action } = req.body;

  try {
    if (action === 'UPDATE') {
      const { student_id, payload } = req.body;
      
      const { data: oldStudent, error: fetchErr } = await supabaseAdmin.from('students').select('*').eq('student_id', student_id).single();
      if (fetchErr || !oldStudent) throw new Error("Student not found.");

      const sanitizedName = payload.name.toUpperCase();
      const sanitizedCourse = payload.course ? payload.course.toUpperCase() : null;
      const sanitizedYearLevel = payload.year_level ? payload.year_level.toUpperCase() : null;

      const updates = {
          name: sanitizedName,
          course: sanitizedCourse,
          year_level: sanitizedYearLevel,
          last_updated: new Date()
      };

      const { error: updErr } = await supabaseAdmin.from('students').update(updates).eq('student_id', student_id);
      if (updErr) throw updErr;
      
      await logAudit('UPDATE', student_id, sanitizedName, oldStudent, updates);
      return res.status(200).json({ success: true });
    }
    
    else if (action === 'IMPORT') {
      const { rows } = req.body;
      let insertedCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      const processErrors = [];

      // 1. Process and Insert Courses First to satisfy Foreign Keys
      const uniqueCourses = [...new Set(rows.map(r => r.course).filter(Boolean))];
      if (uniqueCourses.length > 0) {
        const coursePayload = uniqueCourses.map(c => ({ code: c }));
        await supabaseAdmin.from('courses').upsert(coursePayload, { onConflict: 'code' });
      }

      // 2. Fetch Existing Students for Comparison
      const batchIds = rows.map(r => r.student_id);
      const { data: existingStudents } = await supabaseAdmin
          .from('students')
          .select('student_id, name, course, year_level')
          .in('student_id', batchIds);

      const existingMap = new Map((existingStudents || []).map(s => [s.student_id, s]));

      const toInsert = [];
      const toUpdate = [];
      const updateDetails = [];

      rows.forEach((row) => {
          const existing = existingMap.get(row.student_id);
          const sanitizedRow = {
              student_id: row.student_id,
              name: row.name,
              course: row.course || null,
              year_level: row.year_level || null,
              last_updated: new Date()
          };

          if (existing) {
              let needsUpdate = false;
              if (existing.name !== sanitizedRow.name) needsUpdate = true;
              if ((existing.course || null) !== sanitizedRow.course) needsUpdate = true;
              if ((existing.year_level || null) !== sanitizedRow.year_level) needsUpdate = true;

              if (needsUpdate) {
                  toUpdate.push(sanitizedRow);
                  updateDetails.push({ old: existing, new: sanitizedRow });
              } else {
                  unchangedCount++;
              }
          } else {
              toInsert.push(sanitizedRow);
          }
      });

      if (toInsert.length > 0) {
          const { error } = await supabaseAdmin.from('students').insert(toInsert);
          if (!error) insertedCount = toInsert.length;
          else processErrors.push(`Bulk insert failed: ${error.message}`);
      }

      if (toUpdate.length > 0) {
          const { error } = await supabaseAdmin.from('students').upsert(toUpdate, { onConflict: 'student_id' });
          if (!error) updatedCount = toUpdate.length;
          else processErrors.push(`Bulk update failed: ${error.message}`);
      }

      const importStats = { 
          inserted: insertedCount, 
          updated: updatedCount, 
          unchanged: unchangedCount, 
          errors: processErrors,
          insertedItems: toInsert,
          updatedItems: updateDetails
      };
      
      await logAudit('IMPORT', 'BATCH_IMPORT', `Student CSV Chunk (${rows.length} items)`, null, importStats);
      return res.status(200).json({ success: true, importResult: importStats });
    }

    else if (action === 'CREATE_COURSE') {
      const { code } = req.body;
      const sanitizedCode = code.trim().toUpperCase();
      
      const { error } = await supabaseAdmin.from('courses').insert([{ code: sanitizedCode }]);
      if (error) {
        if (error.code === '23505') throw new Error("Course already exists.");
        throw error;
      }

      await logAudit('CREATE_COURSE', sanitizedCode, sanitizedCode, null, { code: sanitizedCode });
      return res.status(200).json({ success: true });
    }

    else if (action === 'DELETE_COURSE') {
      const { code } = req.body;
      const { error } = await supabaseAdmin.from('courses').delete().eq('code', code);
      if (error) {
        if (error.code === '23503') throw new Error("Course cannot be deleted because it is assigned to students.");
        throw error;
      }

      await logAudit('DELETE_COURSE', code, code, { code }, null);
      return res.status(200).json({ success: true });
    }
    
    return res.status(400).json({ error: 'Invalid action payload.' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}