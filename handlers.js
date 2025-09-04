// handlers.js
// Contains all event handler functions.

import { sendRequest } from './api.js';
import { showMessage, openPersonnelModal, openUserModal, renderArchivedReports, renderFilteredHistoryReports, showConfirmModal } from './ui.js';
import { exportSingleReportToExcel, formatThaiDateArabic, formatThaiDateRangeArabic, escapeHTML } from './utils.js';

// All functions access global variables and DOM via the window object

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
            const formattedData = json.map(row => ({
                rank: row['ยศ-คำนำหน้า'], first_name: row['ชื่อ'], last_name: row['นามสกุล'],
                position: row['ตำแหน่ง'], specialty: row['เหล่า'], department: row['แผนก']
            }));
            const response = await sendRequest('import_personnel', { personnel: formattedData });
            if (response.status === 'success') {
                window.loadDataForPane('pane-personnel');
            }
            showMessage(response.message, response.status === 'success');
        } catch (error) {
            console.error("Error processing Excel file:", error);
            showMessage("เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel", false);
        } finally {
            window.excelImportInput.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

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
    const weekRangeText = document.getElementById('report-week-range')?.textContent || '';
    window.archiveConfirmModal.classList.remove('active');
    if (!window.currentWeeklyReports || window.currentWeeklyReports.length === 0) {
        showMessage('ไม่มีข้อมูลรายงานที่จะส่งออก', false);
        return;
    }
    exportSingleReportToExcel(window.currentWeeklyReports, `รายงานกำลังพล-${new Date().toISOString().split('T')[0]}.xlsx`, weekRangeText);
    try {
        const response = await sendRequest('archive_reports', { reports: window.currentWeeklyReports });
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
    if (!year || !month) {
        showMessage('กรุณาเลือกปีและเดือน', false);
        return;
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
