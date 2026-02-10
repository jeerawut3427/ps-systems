// handlers.js
// Contains all event handler functions.

import { sendRequest } from './api.js';
import { showMessage, openPersonnelModal, openUserModal, showConfirmModal, addStatusRow, renderArchivedReports, renderFilteredHistoryReports } from './ui.js';
import { exportSingleReportToExcel, formatThaiDateRangeArabic, escapeHTML } from './utils.js';

// --- Global Variables ---
let pendingImportData = null; // ตัวแปรเก็บข้อมูลนำเข้าที่รอการยืนยัน

// --- Personnel Handlers ---

export async function handlePersonnelFormSubmit(e) {
    e.preventDefault();
    const personId = window.personnelForm.querySelector('#person-id').value;
    const data = {
        id: personId,
        rank: window.personnelForm.querySelector('#person-rank').value,
        first_name: window.personnelForm.querySelector('#person-first-name').value,
        last_name: window.personnelForm.querySelector('#person-last-name').value,
        position: window.personnelForm.querySelector('#person-position').value,
        specialty: window.personnelForm.querySelector('#person-specialty').value,
        department: window.personnelForm.querySelector('#person-department').value,
    };
    const action = personId ? 'update_personnel' : 'add_personnel';
    try {
        const response = await sendRequest(action, { data });
        if (response.status === 'success') {
            window.personnelModal.classList.remove('active');
            window.loadDataForPane('pane-personnel');
        }
        showMessage(response.message, response.status === 'success');
    } catch (error) {
        showMessage(error.message, false);
    }
}

export async function handlePersonnelListClick(e) {
    const target = e.target;
    const personId = target.dataset.id;
    if (!personId) return;

    if (target.classList.contains('delete-person-btn')) {
        showConfirmModal('ยืนยันการลบข้อมูล', 'คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลกำลังพลนี้?', async () => {
            try {
                const response = await sendRequest('delete_personnel', { id: personId });
                if (response.status === 'success') window.loadDataForPane('pane-personnel');
                showMessage(response.message, response.status === 'success');
            } catch(error) {
                showMessage(error.message, false);
            }
        });
    } else if (target.classList.contains('edit-person-btn')) {
        try {
            const res = await sendRequest('get_personnel_details', { id: personId });
            if (res.status === 'success' && res.personnel) {
                openPersonnelModal(res.personnel);
            } else {
                showMessage(res.message || 'ไม่พบข้อมูลกำลังพลที่ต้องการแก้ไข', false);
            }
        } catch(error) {
            showMessage(error.message, false);
        }
    }
}

// --- User (Admin) Handlers ---

export async function handleUserFormSubmit(e) {
    e.preventDefault();
    const username = window.userForm.querySelector('#user-username').value;
    const password = window.userForm.querySelector('#user-password').value;
    const data = {
        username: username, password: password,
        rank: window.userForm.querySelector('#user-rank').value,
        first_name: window.userForm.querySelector('#user-first-name').value,
        last_name: window.userForm.querySelector('#user-last-name').value,
        position: window.userForm.querySelector('#user-position').value,
        department: window.userForm.querySelector('#user-department').value,
        role: window.userForm.querySelector('#user-role').value,
    };
    if (!password) delete data.password;
    const action = window.userForm.querySelector('#user-username').readOnly ? 'update_user' : 'add_user';
    
    try {
        const response = await sendRequest(action, { data });
        if (response.status === 'success') {
            window.userModal.classList.remove('active');
            window.loadDataForPane('pane-admin');
        }
        showMessage(response.message, response.status === 'success');
    } catch(error) {
        showMessage(error.message, false);
    }
}

export async function handleUserListClick(e) {
    const target = e.target;
    const username = target.dataset.username;
    if (!username) return;

    if (target.classList.contains('delete-user-btn')) {
        showConfirmModal('ยืนยันการลบผู้ใช้', `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ '${username}'?`, async () => {
            try {
                const response = await sendRequest('delete_user', { username: username });
                if (response.status === 'success') window.loadDataForPane('pane-admin');
                showMessage(response.message, response.status === 'success');
            } catch(error) {
                showMessage(error.message, false);
            }
        });
    } else if (target.classList.contains('edit-user-btn')) {
        try {
            const res = await sendRequest('list_users', { page: 1, searchTerm: '' });
            if (res.status === 'success') {
                const userToEdit = res.users.find(u => u.username === username);
                if (userToEdit) openUserModal(userToEdit);
                else showMessage('ไม่พบข้อมูลผู้ใช้ที่ต้องการแก้ไข', false);
            }
        } catch(error) {
            showMessage(error.message, false);
        }
    }
}

// --- Import / Export Handlers ---

export function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);
            
            // แปลงข้อมูลให้ตรงกับฟอร์แมต Database
            const formattedData = json.map(row => ({
                rank: row['ยศ-คำนำหน้า'] || '', 
                first_name: row['ชื่อ'] || '', 
                last_name: row['นามสกุล'] || '',
                position: row['ตำแหน่ง'] || '', 
                specialty: row['เหล่า'] || '', 
                department: row['แผนก'] || ''
            })).filter(item => item.first_name && item.last_name); // กรองแถวที่ไม่มีชื่อออก

            if (formattedData.length === 0) {
                showMessage("ไม่พบข้อมูลที่ถูกต้องในไฟล์ Excel", false);
                return;
            }

            // ส่งไปตรวจสอบ (Preview) ก่อน
            const response = await sendRequest('preview_import_personnel', { personnel: formattedData });
            
            if (response.status === 'success') {
                pendingImportData = formattedData; // เก็บข้อมูลดิบรอไว้
                showImportPreviewModal(response.preview, response.summary); // แสดง Modal
            } else {
                showMessage(response.message, false);
            }

        } catch (error) {
            console.error("Error processing Excel file:", error);
            showMessage("เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel: " + error.message, false);
        } finally {
            if (window.excelImportInput) window.excelImportInput.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

// --- Submission & Reporting Handlers ---

export function handleReviewStatus() {
    const rows = window.statusSubmissionListArea.querySelectorAll('tr');
    const reviewItems = [];
    let hasError = false;

    if (rows.length === 0) {
        showMessage('ไม่พบข้อมูลกำลังพลที่จะส่ง', false);
        return;
    }

    rows.forEach(row => {
        const statusSelect = row.querySelector('.status-select');
        if (statusSelect && statusSelect.value !== 'ไม่มี') {
            const startDate = row.querySelector('.start-date-input').value;
            const endDate = row.querySelector('.end-date-input').value;
            if (!startDate || !endDate) {
                showMessage('กรุณากรอกวันที่เริ่มต้นและสิ้นสุดสำหรับรายการที่เลือก', false);
                hasError = true; return;
            }
            reviewItems.push({
                personnel_id: row.dataset.personnelId,
                personnel_name: row.dataset.personnelName, 
                status: statusSelect.value,
                details: row.querySelector('.details-input').value,
                start_date: startDate, 
                end_date: endDate
            });
        }
    });

    if (hasError) return;

    if (reviewItems.length === 0) {
        window.reviewListArea.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">ยืนยันการส่งยอด: กำลังพลมาปฏิบัติงานครบถ้วน</td></tr>`;
    } else {
        window.reviewListArea.innerHTML = reviewItems.map(item => {
            const dateRange = formatThaiDateRangeArabic(item.start_date, item.end_date);
            return `<tr>
                        <td class="border-t px-4 py-2">${escapeHTML(item.personnel_name)}</td>
                        <td class="border-t px-4 py-2">${escapeHTML(item.status)}</td>
                        <td class="border-t px-4 py-2">${escapeHTML(item.details) || '-'}</td>
                        <td class="border-t px-4 py-2">${dateRange}</td>
                    </tr>`;
        }).join('');
    }

    window.submissionFormSection.classList.add('hidden');
    window.reviewReportSection.classList.remove('hidden');
}

export async function handleSubmitStatusReport() {
    const confirmBtn = document.getElementById('confirm-submit-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'กำลังส่ง...';
    }

    const rows = window.statusSubmissionListArea.querySelectorAll('tr');
    const reportItems = [];
    
    rows.forEach(row => {
        const statusSelect = row.querySelector('.status-select');
        if (statusSelect && statusSelect.value !== 'ไม่มี') {
            reportItems.push({
                personnel_id: row.dataset.personnelId, 
                personnel_name: row.dataset.personnelName,
                status: statusSelect.value, 
                details: row.querySelector('.details-input').value,
                start_date: row.querySelector('.start-date-input').value,
                end_date: row.querySelector('.end-date-input').value
            });
        }
    });

    let reportDepartment = window.currentUser.department;
    if (window.currentUser.role === 'admin') {
        const deptSelector = document.getElementById('admin-dept-selector');
        if (deptSelector) {
            reportDepartment = deptSelector.value;
        }
    }

    const report = {
        items: reportItems,
        department: reportDepartment
    };

    try {
        const response = await sendRequest('submit_status_report', { report });
        showMessage(response.message, response.status === 'success');
        if (response.status === 'success') {
            reviewReportSection.classList.add('hidden');
            if (window.currentUser.role === 'admin') {
                window.switchTab('tab-dashboard');
            } else {
                window.loadDataForPane('pane-submit-status');
            }
        }
    } catch(error) {
        showMessage(error.message, false);
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'ยืนยันและส่งยอด';
        }
    }
}

export async function handleExportAndArchive() {
    const weekRangeText = document.getElementById('report-week-range')?.textContent.replace(/[()]/g, '').trim() || '';
    
    window.archiveConfirmModal.classList.remove('active');
    if (!window.currentWeeklyReports || window.currentWeeklyReports.length === 0) {
        showMessage('ไม่มีข้อมูลรายงานที่จะส่งออก', false);
        return;
    }
    
    exportSingleReportToExcel(window.currentWeeklyReports, `รายงานกำลังพล-${new Date().toISOString().split('T')[0]}.xlsx`, weekRangeText);
    
    try {
        const response = await sendRequest('archive_reports', { 
            reports: window.currentWeeklyReports,
            week_range: weekRangeText 
        });

        showMessage(response.message, response.status === 'success');
        if (response.status === 'success') {
            window.loadDataForPane('pane-report');
        }
    } catch(error) {
        showMessage(error.message, false);
    }
}

export function handleShowArchive() {
    const year = window.archiveYearSelect.value;
    const month = window.archiveMonthSelect.value;
    const archiveTitle = document.getElementById('archive-pane-title');

    if (!year || !month) {
        showMessage('กรุณาเลือกปีและเดือน', false);
        if (archiveTitle) archiveTitle.textContent = 'ประวัติการเก็บรายงานทั้งหมด';
        return;
    }

    const monthName = window.archiveMonthSelect.options[window.archiveMonthSelect.selectedIndex].text;
    if (archiveTitle) {
        archiveTitle.textContent = `ประวัติการเก็บรายงานทั้งหมด - ${monthName} ${year}`;
    }

    const reportsForMonth = window.allArchivedReports[year] ? window.allArchivedReports[year][month] : [];
    renderArchivedReports(reportsForMonth);
}

export function handleArchiveDownloadClick(e) {
    if (e.target.classList.contains('download-daily-archive-btn')) {
        const date = e.target.dataset.date;
        const year = window.archiveYearSelect.value;
        const month = window.archiveMonthSelect.value;
        if (!year || !month || !date) {
            showMessage('กรุณาเลือกปีและเดือนก่อนดาวน์โหลด', false);
            return;
        }

        const reportsForMonth = window.allArchivedReports[year] ? window.allArchivedReports[year][month] : [];
        
        if (!reportsForMonth || !Array.isArray(reportsForMonth)) {
            showMessage('เกิดข้อผิดพลาด: ไม่พบข้อมูลสำหรับเดือนที่เลือก', false);
            return;
        }

        const reportsToDownload = reportsForMonth.filter(r => r.date === date);
        
        if (reportsToDownload.length > 0) {
            exportSingleReportToExcel(reportsToDownload, `รายงานย้อนหลัง-${date}.xlsx`);
        } else {
            showMessage('ไม่พบข้อมูลรายงานที่จะดาวน์โหลดสำหรับวันนี้', false);
        }
    }
}

export async function handleHistoryEditClick(e) {
    const target = e.target;
    if (!target.classList.contains('edit-history-btn')) return;

    const reportId = target.dataset.id;
    if (!reportId) return;

    try {
        const res = await sendRequest('get_report_for_editing', { id: reportId });
        if (res.status === 'success' && res.report) {
            window.editingReportData = res.report;
            window.switchTab('tab-submit-status');
        } else {
            showMessage(res.message || 'ไม่สามารถดึงข้อมูลมาแก้ไขได้', false);
        }
    } catch (error) {
        showMessage(error.message, false);
    }
}

export function handleShowHistory() {
    const year = window.historyYearSelect.value;
    const month = window.historyMonthSelect.value;
    if (!year || !month) {
        showMessage('กรุณาเลือกปีและเดือน', false);
        return;
    }
    const reportsForMonth = window.allHistoryData[year] ? window.allHistoryData[year][month] : [];
    renderFilteredHistoryReports(reportsForMonth);
}

export async function handleWeeklyReportEditClick(e) {
    const target = e.target;
    if (!target.classList.contains('edit-weekly-report-btn')) return;

    const reportId = target.dataset.id;
    if (!reportId) return;

    try {
        const res = await sendRequest('get_report_for_editing', { id: reportId });
        if (res.status === 'success' && res.report) {
            window.editingReportData = res.report;
            window.switchTab('tab-submit-status');
        } else {
            showMessage(res.message || 'ไม่สามารถดึงข้อมูลมาแก้ไขได้', false);
        }
    } catch (error) {
        showMessage(error.message, false);
    }
}

// *** Holiday Handlers ***
export async function renderHolidays(res) {
    const { holidays } = res;
    if (!window.holidayListContainer) return;
    window.holidayListContainer.innerHTML = '';

    if (!holidays || holidays.length === 0) {
        window.holidayListContainer.innerHTML = '<p class="text-center text-gray-500 p-4">ยังไม่มีวันหยุดที่กำหนดไว้</p>';
        return;
    }
    
    let holidayHTML = '<table class="min-w-full bg-white divide-y divide-gray-200">';
    holidayHTML += `<thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รายละเอียด</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการ</th>
                        </tr>
                    </thead>`;
    holidayHTML += '<tbody class="bg-white divide-y divide-gray-200">';

    holidays.forEach(holiday => {
        const formattedDate = new Date(holiday.date + 'T00:00:00').toLocaleDateString('th-TH', {
            dateStyle: 'full'
        });
        holidayHTML += `<tr>
            <td class="px-6 py-4 whitespace-nowrap">${formattedDate}</td>
            <td class="px-6 py-4 whitespace-nowrap">${escapeHTML(holiday.description)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button data-date="${escapeHTML(holiday.date)}" class="delete-holiday-btn text-red-600 hover:text-red-900">ลบ</button>
            </td>
        </tr>`;
    });

    holidayHTML += '</tbody></table>';
    window.holidayListContainer.innerHTML = holidayHTML;
}

export async function handleAddHoliday(e) {
    e.preventDefault(); 
    const holidayDate = document.getElementById('holiday-date').value;
    const description = document.getElementById('holiday-description').value;
    
    if (!holidayDate || !description) {
        showMessage('กรุณากรอกข้อมูลให้ครบถ้วน', false);
        return;
    }
    
    try {
        const res = await sendRequest('add_holiday', { date: holidayDate, description });
        showMessage(res.message, res.status === 'success');
        if (res.status === 'success') {
            window.holidayForm.reset();
            if (window.holidayDatepicker) {
                window.holidayDatepicker.clear();
            }
            window.loadDataForPane('pane-holidays');
        }
    } catch (error) {
        showMessage(error.message, false);
    }
}

export async function handleDeleteHoliday(e) {
    if (!e.target.classList.contains('delete-holiday-btn')) return;
    
    const holidayDate = e.target.dataset.date;
    showConfirmModal('ยืนยันการลบ', `คุณแน่ใจหรือไม่ว่าต้องการลบวันหยุดนี้ (${holidayDate})?`, async () => {
        try {
            const res = await sendRequest('delete_holiday', { date: holidayDate });
            showMessage(res.message, res.status === 'success');
            if (res.status === 'success') {
                window.loadDataForPane('pane-holidays');
            }
        } catch (error) {
            showMessage(error.message, false);
        }
    });
}

// --- Helper Functions (Local) ---

// ฟังก์ชันสร้างและแสดง Modal ตรวจสอบข้อมูลนำเข้า (ฉบับแก้ไข: ลบของเก่าทิ้งเพื่อป้องกัน Error)
function showImportPreviewModal(previewData, summary) {
    // 1. ลบ Modal เก่าทิ้งก่อนเสมอ (ป้องกันปัญหาโครงสร้าง HTML ไม่ตรงกัน)
    const existingModal = document.getElementById('import-preview-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // 2. แยกข้อมูลเป็น 2 กลุ่ม
    const newItems = previewData.filter(item => item.import_status === 'new');
    const updateItems = previewData.filter(item => item.import_status === 'update');

    // 3. ฟังก์ชันย่อยสร้างแถวตาราง
    const createTableRows = (items, colorClass) => {
        if (items.length === 0) return '<tr><td colspan="4" class="text-center py-4 text-gray-400">ไม่มีรายการ</td></tr>';
        return items.map((item, index) => `
            <tr class="hover:bg-gray-50 border-b last:border-b-0">
                <td class="py-2 px-4 text-sm text-gray-500">${index + 1}</td>
                <td class="py-2 px-4 text-sm font-medium text-gray-900">${escapeHTML(item.rank || '')} ${escapeHTML(item.first_name || '')} ${escapeHTML(item.last_name || '')}</td>
                <td class="py-2 px-4 text-sm text-gray-600">${escapeHTML(item.position || '')}</td>
                <td class="py-2 px-4 text-sm text-gray-600">${escapeHTML(item.department || '')}</td>
            </tr>
        `).join('');
    };

    // 4. สร้าง HTML ของ Modal ใหม่
    const modalHTML = `
        <div class="modal-content shadow-xl rounded-lg bg-white overflow-hidden" style="width: 900px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
            
            <div class="modal-header bg-gray-800 text-white px-6 py-4 flex justify-between items-center">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    ตรวจสอบข้อมูลนำเข้า
                </h2>
                <span class="close-btn text-gray-400 hover:text-white cursor-pointer text-2xl leading-none">&times;</span>
            </div>

            <div class="modal-body bg-gray-50 p-6 overflow-y-auto flex-grow">
                
                <div class="mb-6 bg-white rounded-lg shadow-sm border border-green-200 overflow-hidden">
                    <div class="bg-green-50 px-4 py-2 border-b border-green-200 flex justify-between items-center">
                        <h3 class="font-bold text-green-800 flex items-center gap-2">
                            <span class="bg-green-500 w-2 h-2 rounded-full inline-block"></span>
                            รายชื่อที่จะเพิ่มใหม่ (${newItems.length})
                        </h3>
                    </div>
                    <table class="min-w-full text-left">
                        <thead class="bg-gray-50 text-gray-500 font-medium border-b">
                            <tr>
                                <th class="py-2 px-4 w-12 text-xs uppercase">#</th>
                                <th class="py-2 px-4 text-xs uppercase">ชื่อ-สกุล</th>
                                <th class="py-2 px-4 text-xs uppercase">ตำแหน่ง</th>
                                <th class="py-2 px-4 text-xs uppercase">สังกัด</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${createTableRows(newItems, 'green')}
                        </tbody>
                    </table>
                </div>

                <div class="bg-white rounded-lg shadow-sm border border-orange-200 overflow-hidden">
                    <div class="bg-orange-50 px-4 py-2 border-b border-orange-200 flex justify-between items-center">
                        <h3 class="font-bold text-orange-800 flex items-center gap-2">
                            <span class="bg-orange-500 w-2 h-2 rounded-full inline-block"></span>
                            รายชื่อที่จะอัปเดตข้อมูล (${updateItems.length})
                        </h3>
                        <span class="text-xs text-orange-600">* รายชื่อซ้ำกับในระบบ ข้อมูลยศ/ตำแหน่ง/สังกัด จะถูกอัปเดตตามไฟล์ Excel</span>
                    </div>
                    <table class="min-w-full text-left">
                        <thead class="bg-gray-50 text-gray-500 font-medium border-b">
                            <tr>
                                <th class="py-2 px-4 w-12 text-xs uppercase">#</th>
                                <th class="py-2 px-4 text-xs uppercase">ชื่อ-สกุล</th>
                                <th class="py-2 px-4 text-xs uppercase">ตำแหน่งใหม่</th>
                                <th class="py-2 px-4 text-xs uppercase">สังกัดใหม่</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${createTableRows(updateItems, 'orange')}
                        </tbody>
                    </table>
                </div>

            </div>

            <div class="modal-footer bg-white p-4 border-t flex flex-col gap-4">
                
                <div class="flex justify-between items-center bg-blue-50 px-4 py-3 rounded border border-blue-100">
                    <div class="text-blue-900 font-medium">
                        สรุปรายการทั้งหมด: <span class="text-xl font-bold ml-1">${summary.total}</span> รายการ
                    </div>
                    <div class="flex gap-4 text-sm">
                        <span class="flex items-center gap-1 text-green-700"><span class="w-3 h-3 bg-green-500 rounded-full"></span> เพิ่มใหม่ ${summary.new}</span>
                        <span class="flex items-center gap-1 text-orange-700"><span class="w-3 h-3 bg-orange-500 rounded-full"></span> อัปเดต ${summary.update}</span>
                    </div>
                </div>

                <div class="flex justify-end gap-3">
                    <button id="btn-cancel-import" class="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded transition-colors">ยกเลิก</button>
                    <button id="btn-confirm-import" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow transition-colors flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                        ยืนยันการนำเข้าข้อมูล
                    </button>
                </div>
            </div>
        </div>
    `;

    // 5. สร้าง Element ใหม่และนำไปแสดงผล
    const modal = document.createElement('div');
    modal.id = 'import-preview-modal';
    modal.className = 'modal';
    modal.innerHTML = modalHTML;
    document.body.appendChild(modal);

    // 6. ผูก Event Handlers
    const closeAction = () => { modal.classList.remove('active'); pendingImportData = null; };
    modal.querySelector('.close-btn').onclick = closeAction;
    modal.querySelector('#btn-cancel-import').onclick = closeAction;

    modal.querySelector('#btn-confirm-import').onclick = async () => {
        if (!pendingImportData) return;
        const btn = modal.querySelector('#btn-confirm-import');
        const originalContent = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin h-5 w-5 text-white inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> กำลังบันทึก...`;
        btn.disabled = true;

        try {
            const res = await sendRequest('import_personnel', { personnel: pendingImportData });
            if (res.status === 'success') {
                window.loadDataForPane('pane-personnel');
                showMessage(res.message, true);
                closeAction();
            } else {
                showMessage(res.message, false);
            }
        } catch (err) {
            showMessage(err.message, false);
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    };

    // 7. แสดง Modal
    setTimeout(() => modal.classList.add('active'), 10);
}