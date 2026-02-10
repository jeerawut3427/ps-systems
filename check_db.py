import sqlite3

def check_data():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("--- ตรวจสอบโครงสร้างตาราง personnel ---")
    cursor.execute("PRAGMA table_info(personnel)")
    columns = [row['name'] for row in cursor.fetchall()]
    print(f"Columns: {columns}")
    
    print("\n--- ตรวจสอบข้อมูล 5 รายการแรก ---")
    cursor.execute("SELECT * FROM personnel LIMIT 5")
    rows = cursor.fetchall()
    
    if not rows:
        print(">> ไม่พบข้อมูลใดๆ ในตาราง personnel (ตารางว่างเปล่า)")
    else:
        for i, row in enumerate(rows):
            item = dict(row)
            print(f"คนที่ {i+1}: ID={item.get('id')}")
            print(f"   ยศ='{item.get('rank')}'")
            print(f"   ชื่อ='{item.get('first_name')}'")
            print(f"   นามสกุล='{item.get('last_name')}'")
            print(f"   ตำแหน่ง='{item.get('position')}'")
            print("-" * 30)

    conn.close()

if __name__ == "__main__":
    check_data()