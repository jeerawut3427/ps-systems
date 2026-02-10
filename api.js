// api.js
// Handles all communication with the backend server.

const API_URL = '/api';

export async function sendRequest(action, payload = {}) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action, payload })
        });

        // ตรวจสอบว่า Response เป็น JSON หรือไม่
        const contentType = response.headers.get("content-type");
        const isJson = contentType && contentType.indexOf("application/json") !== -1;

        if (response.status === 401) {
            // Unauthorized
            localStorage.removeItem('currentUser');
            window.location.href = '/login.html';
            throw new Error('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่');
        }

        if (!response.ok) {
            // กรณี Server แจ้ง Error (4xx, 5xx)
            let errorMessage = `เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ (Status: ${response.status})`;
            
            if (isJson) {
                // ถ้า Server ส่ง Error เป็น JSON ให้อ่าน message
                try {
                    const errorResult = await response.json();
                    errorMessage = errorResult.message || errorMessage;
                } catch (e) {
                    // อ่าน JSON ไม่ได้ ใช้ข้อความ default
                }
            } else {
                // ถ้า Server ส่ง Error เป็น HTML หรือ Text (เช่น 404 Not Found, 500 Internal Error แบบดิบๆ)
                const textResult = await response.text();
                console.error("Non-JSON Error Response:", textResult);
                
                if (response.status === 404) {
                    errorMessage = "ไม่พบคำสั่ง API หรือไฟล์ที่เรียกใช้งาน (404)";
                } else if (response.status === 500) {
                    errorMessage = "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ (500) - กรุณาตรวจสอบ Console Log ของ Server";
                } else {
                    errorMessage = `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${response.status})`;
                }
            }
            throw new Error(errorMessage);
        }

        // กรณี Success (200)
        if (isJson) {
            return await response.json();
        } else {
            // ถ้า 200 OK แต่ไม่ใช่ JSON (ผิดปกติสำหรับ API นี้)
            const text = await response.text();
            console.error("Received non-JSON success response:", text);
            throw new Error("รูปแบบข้อมูลจากเซิร์ฟเวอร์ไม่ถูกต้อง (ไม่ใช่ JSON)");
        }

    } catch (error) {
        console.error("API request failed:", error);
        // ส่งต่อข้อความ Error ให้ UI นำไปแสดงผล
        throw new Error(error.message || 'การเชื่อมต่อกับเซิร์ฟเวอร์ล้มเหลว');
    }
}