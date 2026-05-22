console.log('⏳ Đang khởi động Server... (Bắt đầu đọc file)');

// Nap bien moi truong tu file .env
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const express = require('express');
const app = express();

// Cho phep server doc du lieu JSON tu Client gui len (quan trong cho viec Them/Sua)
// Tang gioi han kich thuoc file upload len 50MB (Fix loi 413 Payload Too Large khi import Excel)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Cấu hình để phục vụ các tệp tĩnh (CSS, JS, hình ảnh, v.v.) từ thư mục gốc
app.use(express.static(__dirname));

// --- BẮT ĐẦU PHẦN QUAN TRỌNG ---

// 1. process.env.PORT: Lấy giá trị PORT bạn đã set trong file run.bat (ví dụ: 3001)
// 2. || 3000: Đây là giá trị dự phòng (fallback). Nếu bạn chạy trực tiếp không qua file .bat
//    hoặc quên set PORT, nó sẽ tự động dùng cổng 3000 để tránh lỗi.
const port = process.env.PORT || 3000;

// --- KẾT THÚC PHẦN QUAN TRỌNG ---

// --- KET NOI DATABASE (AIVEN) ---
const mysql = require('mysql2');

// Bien luu trang thai ket noi de hien thi len web
let dbStatus = { message: '⏳ Đang kết nối...', class: '' };

// Tao ket noi
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Aiven bat buoc dung SSL, dong nay rat quan trong:
  ssl: { rejectUnauthorized: false } 
});

connection.connect((err) => {
  if (err) {
    dbStatus = { message: '❌ Lỗi kết nối Database: ' + err.message, class: 'status-error' };
    console.error('❌ [LOI] Khong the ket noi Database:', err.message);
  } else {
    dbStatus = { message: '✅ Đã kết nối Database thành công!', class: 'status-success' };
    console.log('✅ [THANH CONG] Da ket noi Database Aiven!');
    
    // --- TU DONG CAP NHAT DATABASE (Tranh loi thieu cot) ---
    // Kiem tra xem cot name_doc da co chua, neu chua thi them vao
    connection.query("SHOW COLUMNS FROM nhacungcap LIKE 'name_doc'", (err, results) => {
      if (!err && results.length === 0) {
        console.log("🛠️ Phat hien thieu cot 'name_doc'. Dang tu dong them...");
        connection.query("ALTER TABLE nhacungcap ADD COLUMN name_doc VARCHAR(255) DEFAULT NULL AFTER TENNCC");
      }
    });

    // Tự động kiểm tra và thêm cột qty_partial vào bảng bbrreport (Kế hoạch chi tiết)
    connection.query("SHOW COLUMNS FROM bbrreport LIKE 'qty_partial'", (err, results) => {
      if (!err && results.length === 0) {
        console.log("🛠️ Phat hien thieu cot 'qty_partial'. Dang tu dong them...");
        connection.query("ALTER TABLE bbrreport ADD COLUMN qty_partial INT DEFAULT NULL");
      }
    });

    // Tự động kiểm tra và thêm cột jobno_shp vào bảng importshipment
    connection.query("SHOW COLUMNS FROM importshipment LIKE 'jobno_shp'", (err, results) => {
      if (!err && results.length === 0) {
        console.log("🛠️ Phat hien thieu cot 'jobno_shp'. Dang tu dong them...");
        connection.query("ALTER TABLE importshipment ADD COLUMN jobno_shp VARCHAR(255) DEFAULT NULL AFTER jobno");
      }
    });

    // Tự động kiểm tra và thêm cột is_exported vào bảng bbrreport
    connection.query("SHOW COLUMNS FROM bbrreport LIKE 'is_exported'", (err, results) => {
      if (!err && results.length === 0) {
        console.log("🛠️ Phat hien thieu cot 'is_exported'. Dang tu dong them...");
        connection.query("ALTER TABLE bbrreport ADD COLUMN is_exported TINYINT DEFAULT 0");
      }
    });

    // Tự động kiểm tra và thêm cột total_cbm vào bảng bbrreport
    connection.query("SHOW COLUMNS FROM bbrreport LIKE 'total_cbm'", (err, results) => {
      if (!err && results.length === 0) {
        console.log("🛠️ Phat hien thieu cot 'total_cbm' trong bbrreport. Dang tu dong them...");
        connection.query("ALTER TABLE bbrreport ADD COLUMN total_cbm DECIMAL(10,4) DEFAULT 0");
      }
    });

    // Tự động kiểm tra và thêm cột cbm vào bảng inbound
    connection.query("SHOW COLUMNS FROM inbound LIKE 'cbm'", (err, results) => {
      if (!err && results.length === 0) {
        console.log("🛠️ Phat hien thieu cot 'cbm' trong inbound. Dang tu dong them...");
        connection.query("ALTER TABLE inbound ADD COLUMN cbm DECIMAL(10,4) DEFAULT 0");
      }
    });

    // Tự động kiểm tra và thêm cột hub_DC vào bảng bbrreport
    connection.query("SHOW COLUMNS FROM bbrreport LIKE 'hub_DC'", (err, results) => {
      if (!err && results.length === 0) {
        console.log("🛠️ Phat hien thieu cot 'hub_DC'. Dang tu dong them...");
        connection.query("ALTER TABLE bbrreport ADD COLUMN hub_DC VARCHAR(50) DEFAULT NULL");
      }
    });

    // Tự động tạo bảng DC nếu chưa có để tránh lỗi JOIN trong API BBR
    connection.query("CREATE TABLE IF NOT EXISTS DC (id VARCHAR(50) PRIMARY KEY, hubdc VARCHAR(255))", (err) => {
      if (err) console.error("❌ [LOI] Không thể khởi tạo bảng DC:", err.message);
      else {
        console.log("✅ [THANH CONG] Đảm bảo bảng DC đã tồn tại!");
        // Kiểm tra và thêm cột hubdc nếu bảng DC đã tồn tại nhưng thiếu cột này
        connection.query("SHOW COLUMNS FROM DC LIKE 'hubdc'", (err, results) => {
          if (!err && results.length === 0) {
            console.log("🛠️ Phat hien thieu cot 'hubdc' trong bang DC. Dang tu dong them...");
            connection.query("ALTER TABLE DC ADD COLUMN hubdc VARCHAR(255) DEFAULT NULL");
          }
        });
      }
    });

    // Tự động tạo bảng TCR nếu chưa có
    const createTCRTable = `
      CREATE TABLE IF NOT EXISTS TCR (
        id INT NOT NULL AUTO_INCREMENT,
        parentpo VARCHAR(50) DEFAULT NULL,
        sku VARCHAR(30) DEFAULT NULL,
        idsupplier VARCHAR(50) DEFAULT NULL,
        datercv DATE DEFAULT NULL,
        datesolve DATE DEFAULT NULL,
        carton INT DEFAULT NULL,
        remark VARCHAR(100) DEFAULT NULL,
        status VARCHAR(50) DEFAULT NULL,
        PRIMARY KEY (id)
      )`;
    connection.query(createTCRTable, (err) => {
      if (err) console.error("❌ [LOI] Không thể khởi tạo bảng TCR:", err.message);
      else console.log("✅ [THANH CONG] Đảm bảo bảng TCR đã tồn tại!");
    });

    // Tự động tạo bảng follow nếu chưa có
    const createFollowTable = `
      CREATE TABLE IF NOT EXISTS follow (
        id INT NOT NULL AUTO_INCREMENT,
        sku VARCHAR(20) DEFAULT NULL,
        old_parentPO VARCHAR(50) DEFAULT NULL,
        new_parentPO VARCHAR(50) DEFAULT NULL,
        carton INT DEFAULT NULL,
        status TINYINT(1) DEFAULT '0',
        PRIMARY KEY (id)
      )`;
    connection.query(createFollowTable, (err) => {
      if (err) console.error("❌ [LOI] Không thể khởi tạo bảng follow:", err.message);
      else {
        console.log("✅ [THANH CONG] Đảm bảo bảng follow đã tồn tại!");
        // Tự động kiểm tra và thêm cột supplier vào bảng follow
        connection.query("SHOW COLUMNS FROM follow LIKE 'supplier'", (err, results) => {
          if (!err && results.length === 0) {
            connection.query("ALTER TABLE follow ADD COLUMN supplier VARCHAR(255) DEFAULT NULL");
          }
        });
      }
    });
  }
});

app.get('/', (req, res) => {
  // Doc file index.html va thay the noi dung
  fs.readFile(__dirname + '/index.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi: Không tìm thấy file index.html</h1>');
      return;
    }
    
    // Thay the Placeholder trong HTML bang thong tin that
    let result = data.replace('{{DB_STATUS_TEXT}}', dbStatus.message)
                     .replace('{{STATUS_CLASS}}', dbStatus.class);
    
    res.send(result);
  });
});

// --- IGNORE FAVICON (Tranh loi 404 trong Console browser) ---
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- IGNORE CHROME DEVTOOLS NOISE ---
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.status(204).end());

// --- API MOI: Kiem tra trang thai Database (cho Frontend goi) ---
app.get('/check-db', (req, res) => {
  // Tra ve true neu da ket noi thanh cong (class la status-success)
  res.json({ connected: dbStatus.class === 'status-success' });
});

// --- ROUTE MOI: Trang Dashboard ---
app.get('/dashboard', (req, res) => {
  fs.readFile(__dirname + '/dashboard.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file dashboard.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang Nha Cung Cap (Supplier) ---
app.get('/supplier', (req, res) => {
  fs.readFile(__dirname + '/supplier.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file supplier.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang Master Data ---
app.get('/masterdata', (req, res) => {
  fs.readFile(__dirname + '/masterdata.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file masterdata.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang BBR Report ---
app.get('/bbr', (req, res) => {
  fs.readFile(__dirname + '/bbrreport.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file bbrreport.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang Nhap Kho (Inbound) ---
app.get(['/inbound', '/inbound.html'], (req, res) => {
  fs.readFile(__dirname + '/inbound.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file inbound.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang Xuat Kho (Outbound) ---
app.get(['/outbound', '/outbound.html'], (req, res) => {
  fs.readFile(__dirname + '/outbound.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file outbound.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang AI Smart Pallet ---
app.get(['/smartpallet', '/smartpallet.html'], (req, res) => {
  fs.readFile(__dirname + '/smartpallet.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file smartpallet.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang Scan File ---
app.get(['/scanfile', '/scanfile.html'], (req, res) => {
  fs.readFile(__dirname + '/scanfile.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file scanfile.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang Quản Lý Pallet ---
app.get(['/pallet', '/pallet.html'], (req, res) => {
  fs.readFile(__dirname + '/pallet.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file pallet.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang Truy Van Giao Dich (Transaction) ---
app.get(['/transaction', '/transaction.html'], (req, res) => {
  fs.readFile(__dirname + '/transaction.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file transaction.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang CLP (Import Shipment) ---
app.get(['/clp', '/clp.html'], (req, res) => {
  fs.readFile(__dirname + '/clp.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file clp.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang In CLP ---
app.get(['/printCLP', '/printCLP.html'], (req, res) => {
  fs.readFile(__dirname + '/printCLP.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file printCLP.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang In Picking List ---
app.get(['/printpicking', '/printpicking.html'], (req, res) => {
  fs.readFile(__dirname + '/printpicking.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file printpicking.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang In Picking List SKU ---
app.get(['/printpicking_sku', '/printpicking_sku.html'], (req, res) => {
  fs.readFile(__dirname + '/printpicking_sku.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file printpicking_sku.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang In Tally Sheet ---
app.get(['/printTally', '/printTally.html'], (req, res) => {
  fs.readFile(__dirname + '/printTally.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file printTally.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang Quan Ly TCR ---
app.get(['/tcr', '/tcr.html'], (req, res) => {
  fs.readFile(__dirname + '/tcr.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file tcr.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang Quản Lý Follow ---
app.get(['/follow', '/follow.html'], (req, res) => {
  fs.readFile(__dirname + '/follow.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file follow.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- ROUTE MOI: Trang In Nhãn Pallet ---
app.get(['/printPalletLabel', '/printPalletLabel.html'], (req, res) => {
  fs.readFile(__dirname + '/printPalletLabel.html', 'utf8', (err, data) => {
    if (err) {
      res.send('<h1>Lỗi 404: Không tìm thấy file printPalletLabel.html</h1>');
      return;
    }
    res.send(data);
  });
});

// --- API: Lay danh sach Nha Cung Cap tu Database ---
app.get('/api/suppliers', (req, res) => {
  const { q } = req.query; // Lay tu khoa tim kiem tu URL
  let sql = 'SELECT * FROM nhacungcap';
  let params = [];

  if (q) {
      // Tim kiem theo Ma, Ten hoac Ten chung tu
      sql += ' WHERE MANCC LIKE ? OR TENNCC LIKE ? OR name_doc LIKE ?';
      const keyword = `%${q}%`;
      params = [keyword, keyword, keyword];
  }

  connection.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// --- API: Them moi Nha Cung Cap ---
app.post('/api/suppliers', (req, res) => {
  const { MANCC, TENNCC, QG, name_doc } = req.body;
  
  // Kiem tra du lieu dau vao
  if (!MANCC || !TENNCC) return res.status(400).json({ error: 'Vui lòng nhập Mã và Tên NCC' });

  const sql = 'INSERT INTO nhacungcap (MANCC, TENNCC, QG, name_doc) VALUES (?, ?, ?, ?)';
  connection.query(sql, [MANCC, TENNCC, QG, name_doc], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Thêm thành công!', id: MANCC });
  });
});

// --- API: Cap nhat Nha Cung Cap (Edit) ---
app.put('/api/suppliers', (req, res) => {
  const { MANCC, TENNCC, QG, name_doc } = req.body;
  
  const sql = 'UPDATE nhacungcap SET TENNCC = ?, QG = ?, name_doc = ? WHERE MANCC = ?';
  connection.query(sql, [TENNCC, QG, name_doc, MANCC], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Cập nhật thành công!' });
  });
});

// --- API: Quan ly Master Data ---

// 1. Lay danh sach Master Data
app.get('/api/masterdata', (req, res) => {
    const { q } = req.query;
    // JOIN voi bang nhacungcap de lay TENNCC
    let sql = 'SELECT m.*, n.name_doc FROM masterdata m LEFT JOIN nhacungcap n ON m.MANCC = n.MANCC';
    let params = [];
    if (q) {
        sql += ' WHERE m.sku LIKE ? OR m.description LIKE ? OR m.MANCC LIKE ? OR n.name_doc LIKE ?';
        const k = `%${q}%`;
        params = [k, k, k, k];
    }
    connection.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Them moi Master Data
app.post('/api/masterdata', (req, res) => {
    const d = req.body;
    if (!d.MANCC || !d.sku) return res.status(400).json({ error: 'Thiếu MANCC hoặc SKU' });
    
    const sql = `INSERT INTO masterdata 
    (MANCC, sku, description, quantity, weight, length, width, height, cbm, refix, remark, loosecase, cartonperpallet, kindpallet, chipboard) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const v = [d.MANCC, d.sku, d.description, d.quantity, d.weight, d.length, d.width, d.height, d.cbm, d.refix, d.remark, d.loosecase, d.cartonperpallet, d.kindpallet, d.chipboard];
    
    connection.query(sql, v, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'OK' });
    });
});

// 3. Cap nhat Master Data
app.put('/api/masterdata', (req, res) => {
    const d = req.body;
    const sql = `UPDATE masterdata SET 
    MANCC=?, sku=?, description=?, quantity=?, weight=?, length=?, width=?, height=?, cbm=?, refix=?, remark=?, loosecase=?, cartonperpallet=?, kindpallet=?, chipboard=? 
    WHERE id=?`;
    const v = [d.MANCC, d.sku, d.description, d.quantity, d.weight, d.length, d.width, d.height, d.cbm, d.refix, d.remark, d.loosecase, d.cartonperpallet, d.kindpallet, d.chipboard, d.id];
    connection.query(sql, v, (err) => { if (err) return res.status(500).json({ error: err.message }); res.json({ message: 'OK' }); });
});

// --- API: Quan ly BBR Report ---

// 1. Lay danh sach BBR
app.get('/api/bbr', (req, res) => {
    const { q, start, end, parentpo } = req.query;
    let sql = 'SELECT b.*, m.cbm AS mapped_cbm, m.kindpallet AS mapped_kindpallet, m.chipboard AS mapped_chipboard, n.name_doc, d.hubdc FROM bbrreport b LEFT JOIN masterdata m ON b.item = m.sku LEFT JOIN nhacungcap n ON b.supplier = n.MANCC LEFT JOIN DC d ON b.hub_DC = d.id';
    let params = [];
    let conditions = [];

    if (q) {
        conditions.push('(b.po LIKE ? OR b.item LIKE ? OR b.supplier LIKE ? OR n.name_doc LIKE ? OR b.parentpo LIKE ? OR d.hubdc LIKE ?)');
        const k = `%${q}%`;
        params.push(k, k, k, k, k, k);
    }
    if (start) {
        conditions.push('b.deliverydate >= ?');
        params.push(start);
    }
    if (end) {
        conditions.push('b.deliverydate <= ?');
        params.push(end);
    }
    if (parentpo) {
        conditions.push('b.parentpo = ?');
        params.push(parentpo);
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Sap xep moi nhat len dau
    sql += ' ORDER BY b.id DESC';
    
    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error('❌ [API ERROR] /api/bbr:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// 2. Them moi BBR
app.post('/api/bbr', (req, res) => {
    const d = req.body;
    const sql = `INSERT INTO bbrreport 
    (origin, po, item, supplier, parentpo, deliverydate, qty, cbm, week, kindpallet, total_cbm, keycheck, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const v = [d.origin, d.po, d.item, d.supplier, d.parentpo, d.deliverydate, d.qty, d.cbm, d.week, d.kindpallet, d.total_cbm, d.keycheck, d.status];
    
    connection.query(sql, v, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Thêm thành công!' });
    });
});

// 3. Cap nhat BBR
app.put('/api/bbr', (req, res) => {
    const d = req.body;
    const sql = `UPDATE bbrreport SET 
    origin=?, po=?, item=?, supplier=?, parentpo=?, deliverydate=?, qty=?, cbm=?, week=?, kindpallet=?, total_cbm=?, keycheck=?, status=? 
    WHERE id=?`;
    const v = [d.origin, d.po, d.item, d.supplier, d.parentpo, d.deliverydate, d.qty, d.cbm, d.week, d.kindpallet, d.total_cbm, d.keycheck, d.status, d.id];
    
    connection.query(sql, v, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Cập nhật thành công!' });
    });
});

// 4. Import Master Data tu Excel
app.post('/api/masterdata/import', async (req, res) => {
    const data = req.body; // Mang du lieu tu Excel gui len
    if (!Array.isArray(data)) return res.status(400).json({ error: "Dữ liệu không hợp lệ" });

    try {
        // 1. Lay danh sach Nha Cung Cap hop le de kiem tra
        const [vendors] = await connection.promise().query('SELECT MANCC FROM nhacungcap');
        const validVendors = new Set(vendors.map(v => v.MANCC));

        let updatedCount = 0;
        let insertedCount = 0;
        const promises = data.map(async (row) => {
            // Lay cac cot tu Excel (Chu y ten cot trong Excel phai khop voi ten bien nay)
            const vendorCode = row['Vendor Code'] || row['vendor_code'] || row['MANCC'];
            const sku = row['SKU'] || row['sku'];
            
            // Neu Vendor Code khong co trong he thong thi bo qua
            if (!vendorCode || !validVendors.has(vendorCode)) return;
            if (!sku) return;

            // Lay du lieu tho tu Excel
            const qtyPerMC = parseInt(row['Qty Per MC'] || row['quantity'] || 0);
            const weightExcel = parseFloat(row['Weight'] || row['weight'] || 0);
            const lengthExcel = parseFloat(row['Length'] || row['length'] || 0);
            const widthExcel = parseFloat(row['Width'] || row['width'] || 0);
            const heightExcel = parseFloat(row['Height'] || row['height'] || 0);

            // Tinh toan theo cong thuc
            const length = lengthExcel / 10;
            const width = widthExcel / 10;
            const height = heightExcel / 10;
            // CBM = (L*W*H / 1M) * So luong
            const cbm = ((length * width * height) / 1000000) * qtyPerMC;

            // Kiem tra xem SKU da ton tai trong he thong chua
            const [existing] = await connection.promise().query(
                'SELECT id FROM masterdata WHERE MANCC = ? AND sku = ?', 
                [vendorCode, sku]
            );

            if (existing.length > 0) {
                // UPDATE: Neu da co thi cap nhat
                const sql = `UPDATE masterdata SET quantity=?, weight=?, length=?, width=?, height=?, cbm=? WHERE id=?`;
                await connection.promise().query(sql, [qtyPerMC, weightExcel, length, width, height, cbm, existing[0].id]);
                updatedCount++;
            } else {
                // INSERT: Neu chua co thi them moi
                const sql = `INSERT INTO masterdata (MANCC, sku, quantity, weight, length, width, height, cbm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                await connection.promise().query(sql, [vendorCode, sku, qtyPerMC, weightExcel, length, width, height, cbm]);
                insertedCount++;
            }
        });

        // Doi tat ca cac lenh cap nhat chay xong
        await Promise.all(promises);

        res.json({ message: `Đã xử lý xong! Cập nhật: ${updatedCount}, Thêm mới: ${insertedCount} mã hàng.` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi xử lý dữ liệu: ' + err.message });
    }
});

// 5. Import BBR Report tu Excel (Logic phuc tap theo yeu cau)
app.post('/api/bbr/import', async (req, res) => {
    const data = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ error: "Dữ liệu không hợp lệ" });

    try {
        let updatedCount = 0;
        let insertedCount = 0;
        const errors = []; // Mang luu cac dong bi loi

        const promises = data.map(async (row, index) => {
            try {
                // Lay du lieu tu Excel (Mapping theo yeu cau)
                const po = row['PO NUMBER'] ? String(row['PO NUMBER']).trim() : '';
                const item = row['ITEM NO'] ? String(row['ITEM NO']).trim() : '';
                const parentpo = row['PARENT PO'] ? String(row['PARENT PO']).trim() : '';
                const hub_dc = row['HUB DC'] || row['hub_dc'] || row['ToHubDC_ID'] || '';
                
                if (!po || !item) {
                    errors.push({ row: index + 2, error: "Thiếu PO hoặc Item", po, item });
                    return;
                }

                // Tinh toan Qty = QTY / QTY per PCK
                const rawQty = parseFloat(row['QTY'] || 0);
                const qtyPerPck = parseFloat(row['QTY per PCK'] || 1);
                const finalQty = qtyPerPck !== 0 ? (rawQty / qtyPerPck) : 0;

                // Kiem tra ton tai trong DB (PO + Item + Parent PO)
                const [existing] = await connection.promise().query(
                    'SELECT id FROM bbrreport WHERE po = ? AND item = ? AND parentpo = ?', 
                    [po, item, parentpo]
                );

                if (existing.length > 0) {
                    // --- CASE 1: UPDATE (Chi cap nhat Qty) ---
                    await connection.promise().query(
                        'UPDATE bbrreport SET qty = ? WHERE id = ?',
                        [finalQty, existing[0].id]
                    );
                    updatedCount++;
                } else {
                    // --- CASE 2: INSERT MOI ---
                    const origin = row['Origin'] || row['origin'] || '';
                    const supplier = row['VNDR CD'] || ''; // Mapping VNDR CD -> supplier
                    const cbm = parseFloat(row['MC CBM'] || 0);
                    
                    // Xu ly Ngay Giao (Delivery Date)
                    let deliveryDate = row['DELIVERY DT'] ? new Date(row['DELIVERY DT']) : new Date();
                    // Logic cong ngay: VN +3, Khac +14
                    const daysToAdd = (origin.toUpperCase() === 'VN') ? 3 : 14;
                    deliveryDate.setDate(deliveryDate.getDate() + daysToAdd);

                    const sql = `INSERT INTO bbrreport (po, item, parentpo, origin, supplier, qty, cbm, deliverydate, hub_DC, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')`;
                    await connection.promise().query(sql, [po, item, parentpo, origin, supplier, finalQty, cbm, deliveryDate, hub_dc]);
                    insertedCount++;
                }
            } catch (rowErr) {
                // Bat loi cho tung dong rieng biet
                errors.push({ 
                    row: index + 2, 
                    error: rowErr.message, 
                    po: row['PO NUMBER'], 
                    item: row['ITEM NO'] 
                });
            }
        });

        await Promise.all(promises);
        
        res.json({ 
            message: `Hoàn tất! Thêm mới: ${insertedCount}, Cập nhật: ${updatedCount}, Lỗi: ${errors.length}`,
            errors: errors, // Tra ve danh sach loi
            inserted: insertedCount, // Tra ve so luong cu the de client cong don
            updated: updatedCount
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi Import BBR: ' + err.message });
    }
});

// 4. Cập nhật trạng thái đã xuất (exported) cho BBR
app.put('/api/bbr/exported', (req, res) => {
    const { id, is_exported } = req.body;
    const sql = 'UPDATE bbrreport SET is_exported = ? WHERE id = ?';
    connection.query(sql, [is_exported ? 1 : 0, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'OK' });
    });
});

// 5. Xóa toàn bộ dữ liệu BBR theo Parent PO
app.delete('/api/bbr/parent/:parentpo', (req, res) => {
    const { parentpo } = req.params;
    if (!parentpo) return res.status(400).json({ error: 'Thiếu Parent PO' });
    const sql = 'DELETE FROM bbrreport WHERE parentpo = ?';
    connection.query(sql, [parentpo], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã xóa thành công ${result.affectedRows} dòng của Parent PO: ${parentpo}` });
    });
});

// 6. Xóa 1 dòng BBR theo ID
app.delete('/api/bbr/:id', (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Thiếu ID' });
    const sql = 'DELETE FROM bbrreport WHERE id = ?';
    connection.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã xóa thành công dòng dữ liệu!` });
    });
});

// --- API: Ho tro Dropdown cho Inbound (Lay tu BBR) ---

// 1. Lay danh sach Parent PO (Distinct)
app.get('/api/bbr/dropdown/parents', (req, res) => {
    // Sắp xếp theo ngày giao hàng xa nhất (MIN deliverydate) đến gần nhất (ASC)
    const sql = `
        SELECT parentpo, MIN(deliverydate) as min_date 
        FROM bbrreport 
        WHERE parentpo IS NOT NULL AND TRIM(parentpo) <> '' 
        GROUP BY parentpo 
        ORDER BY min_date ASC`;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Lay SKU va CBM theo Parent PO
app.get('/api/bbr/dropdown/items', (req, res) => {
    const { parentpo } = req.query;
    // Lay item (SKU) va cbm (don vi) cua Parent PO do
    // Lay them supplier de auto-fill cho Frontend
    connection.query('SELECT b.item, b.supplier, MAX(b.cbm) as cbm, n.name_doc FROM bbrreport b LEFT JOIN nhacungcap n ON b.supplier = n.MANCC WHERE b.parentpo = ? GROUP BY b.item, b.supplier, n.name_doc', [parentpo], (err, results) => {
         if (err) return res.status(500).json({ error: err.message });
         res.json(results);
    });
});

// --- API: Ho tro Popup Xac nhan Inbound ---
app.get('/api/bbr/details', (req, res) => {
    const { parentpo, sku } = req.query;
    if (!parentpo || !sku) {
        return res.status(400).json({ error: 'Thiếu Parent PO hoặc SKU' });
    }
    // Lay tat ca child PO va so luong ke hoach tuong ung
    const sql = 'SELECT po, qty FROM bbrreport WHERE parentpo = ? AND item = ?';
    connection.query(sql, [parentpo, sku], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- API: Quan ly Inbound (Nhap Kho) ---

// 1. Lay danh sach Inbound
app.get('/api/inbound', (req, res) => {
    const { q, start, end } = req.query;
    // JOIN voi bang nhacungcap de lay TENNCC
    let sql = `
        SELECT i.*, 
               MAX(n.TENNCC) as TENNCC, 
               MAX(n.name_doc) as name_doc, 
               MAX(m.cartonperpallet) as cartonperpallet,
               MAX(b.qty_partial) as qty_partial
        FROM inbound i 
        LEFT JOIN nhacungcap n ON i.MANCC = n.MANCC 
        LEFT JOIN masterdata m ON i.sku = m.sku
        LEFT JOIN bbrreport b ON i.po = b.parentpo AND i.sku = b.item`;
    let params = [];
    let conditions = [];

    if (q) {
        conditions.push('(i.po LIKE ? OR i.sku LIKE ? OR i.MANCC LIKE ? OR n.TENNCC LIKE ? OR i.PackinglistNo LIKE ?)');
        const k = `%${q}%`;
        params.push(k, k, k, k, k);
    }
    if (start) { conditions.push('i.datercv >= ?'); params.push(start); }
    if (end) { conditions.push('i.datercv <= ?'); params.push(end); }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' GROUP BY i.id ORDER BY i.datercv DESC, i.id DESC'; // Sap xep theo Ngay Nhap moi nhat, GROUP BY de tranh trung lap

    connection.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Them moi / Cap nhat Inbound
app.post('/api/inbound', (req, res) => {
    const d = req.body;
    let sql = '', v = [];
    if (d.id) { // Update
        sql = 'UPDATE inbound SET MANCC=?, po=?, sku=?, carton=?, contxe=?, datercv=?, cbm=?, labour=?, PackinglistNo=? WHERE id=?';
        v = [d.MANCC, d.po, d.sku, d.carton, d.contxe, d.datercv, d.cbm, d.labour, d.PackinglistNo, d.id];
    } else { // Insert
        sql = 'INSERT INTO inbound (MANCC, po, sku, carton, contxe, datercv, cbm, labour, PackinglistNo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        v = [d.MANCC, d.po, d.sku, d.carton, d.contxe, d.datercv, d.cbm, d.labour, d.PackinglistNo];
    }
    connection.query(sql, v, (err) => { 
        if (err) return res.status(500).json({ error: err.message }); 

        // --- CAP NHAT TRANG THAI NGUOC LAI VAO BBR REPORT ---
        if (d.bbrUpdates && Array.isArray(d.bbrUpdates)) {
            d.bbrUpdates.forEach(u => {
                // Cap nhat status cho tung Child PO
                connection.query('UPDATE bbrreport SET status = ?, qty_partial = ? WHERE po = ? AND item = ?', [u.status, u.qty_partial, u.po, u.item]);
            });
        }

        res.json({ message: 'Lưu thành công!' }); 
    });
});

// 3. Cap nhat nhieu dong theo Packing List (Bulk Update)
app.put('/api/inbound/by-packinglist', (req, res) => {
    const { PackinglistNo, datercv, contxe, labour } = req.body;
    if (!PackinglistNo) return res.status(400).json({ error: 'Thiếu số Packing List' });

    const sql = 'UPDATE inbound SET datercv=?, contxe=?, labour=? WHERE PackinglistNo=?';
    connection.query(sql, [datercv, contxe, labour, PackinglistNo], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã cập nhật ${result.affectedRows} dòng!` });
    });
});

// 3.5. Lấy tổng Carton và CBM theo Packing List (Dùng cho Modal nhập liệu)
app.get('/api/inbound/pl-totals/:plNo', (req, res) => {
    const { plNo } = req.params;
    const sql = 'SELECT SUM(carton) as totalCarton, SUM(cbm) as totalCbm FROM inbound WHERE PackinglistNo = ?';
    connection.query(sql, [plNo], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results[0] || { totalCarton: 0, totalCbm: 0 });
    });
});

// 4. Xóa toàn bộ dòng theo Packing List
app.delete('/api/inbound/by-packinglist/:plNo', (req, res) => {
    const { plNo } = req.params;
    if (!plNo) return res.status(400).json({ error: 'Thiếu số Packing List' });
    const sql = 'DELETE FROM inbound WHERE PackinglistNo = ?';
    connection.query(sql, [plNo], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã xóa thành công Packing List ${plNo} (${result.affectedRows} dòng).` });
    });
});

// --- API: Hỗ trợ Dropdown cho TCR (Lấy từ Inbound) ---
app.get('/api/inbound/dropdown/po', (req, res) => {
    const sql = "SELECT DISTINCT po FROM inbound WHERE po IS NOT NULL AND TRIM(po) <> '' ORDER BY po ASC";
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/inbound/dropdown/items', (req, res) => {
    const { po } = req.query;
    const sql = "SELECT i.sku, MAX(i.MANCC) as MANCC, MAX(n.TENNCC) as TENNCC, MAX(n.name_doc) as name_doc FROM inbound i LEFT JOIN nhacungcap n ON i.MANCC = n.MANCC WHERE i.po = ? GROUP BY i.sku";
    connection.query(sql, [po], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- API: Quan ly Xuat Kho (Outbound) ---

// 1. Lay danh sach Outbound
app.get('/api/outbound', (req, res) => {
    const { q, start, end, noCont } = req.query;
    let sql = 'SELECT o.*, m.chipboard, m.cartonperpallet, m.kindpallet AS mapped_kindpallet FROM outbound o LEFT JOIN masterdata m ON o.sku = m.sku';
    let params = [];
    let conditions = [];

    if (q) {
        conditions.push('(o.jobno LIKE ? OR o.rsl LIKE ? OR o.childpo LIKE ? OR o.sku LIKE ?)');
        const k = `%${q}%`;
        params.push(k, k, k, k);
    }
    if (start) { conditions.push('o.datestuff >= ?'); params.push(start); }
    if (end) { conditions.push('o.datestuff <= ?'); params.push(end); }
    
    // Lọc những Job chưa có số Container
    if (noCont === 'true') {
        conditions.push("(o.container IS NULL OR TRIM(o.container) = '')");
    }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY o.datestuff DESC, o.id DESC';

    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error('❌ [API ERROR] GET /api/outbound:', err.message);
            console.error('▶️ Câu lệnh SQL bị lỗi:', sql);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// 2. Them moi Outbound
app.post('/api/outbound', (req, res) => {
    const d = req.body;
    // Xu ly date rong thanh null (tru datercv bat buoc)
    const datestuff = d.datestuff ? d.datestuff : null;
    
    const sql = `INSERT INTO outbound 
    (jobno, rsl, parentpo, childpo, fdc, sku, carton, lct, cbm, datercv, container, seal, datestuff, looscarton, kindpallet, remark) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const v = [d.jobno, d.rsl, d.parentpo, d.childpo, d.fdc, d.sku, d.carton, d.lct, d.cbm, d.datercv, d.container, d.seal, datestuff, d.looscarton, d.kindpallet, d.remark];

    connection.query(sql, v, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Thêm mới thành công!', id: result.insertId });
    });
});

// 3. Cap nhat Outbound
app.put('/api/outbound', (req, res) => {
    const d = req.body;
    if (!d.id) return res.status(400).json({ error: 'Thiếu ID' });
    
    const datestuff = d.datestuff ? d.datestuff : null;

    const sql = `UPDATE outbound SET 
    jobno=?, rsl=?, parentpo=?, childpo=?, fdc=?, sku=?, carton=?, lct=?, cbm=?, datercv=?, container=?, seal=?, datestuff=?, looscarton=?, kindpallet=?, remark=? 
    WHERE id=?`;

    const v = [d.jobno, d.rsl, d.parentpo, d.childpo, d.fdc, d.sku, d.carton, d.lct, d.cbm, d.datercv, d.container, d.seal, datestuff, d.looscarton, d.kindpallet, d.remark, d.id];

    connection.query(sql, v, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Cập nhật thành công!' });
    });
});

// 5. Import Outbound tu Excel
app.post('/api/outbound/import', async (req, res) => {
    const data = req.body;
    if (!Array.isArray(data) || data.length === 0) return res.status(400).json({ error: "Dữ liệu không hợp lệ" });

    try {
        // SQL Bulk Insert
        const sql = `INSERT INTO outbound (
            jobno, rsl, parentpo, childpo, fdc, sku, carton, cbm, datercv
        ) VALUES ?`;

        const values = data.map(d => [
            d.jobno, 
            d.rsl, 
            d.parentpo, 
            d.childpo, 
            d.fdc, 
            d.sku, 
            d.carton, 
            d.cbm, 
            d.datercv
        ]);

        const [result] = await connection.promise().query(sql, [values]);
        res.json({ message: `Đã import thành công ${result.affectedRows} dòng vào Outbound.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi Database: ' + err.message });
    }
});

// 4. Cap nhat Stuffing cho toan bo Job No (Bulk Update)
app.put('/api/outbound/stuffing', (req, res) => {
    const { jobno, container, seal, datestuff } = req.body;
    if (!jobno) return res.status(400).json({ error: 'Thiếu Job No' });
    
    const sql = `UPDATE outbound SET container=?, seal=?, datestuff=? WHERE jobno=?`;
    const stuffingDate = datestuff ? datestuff : null;

    connection.query(sql, [container, seal, stuffingDate, jobno], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã cập nhật thông tin đóng hàng cho Job ${jobno} (${result.affectedRows} dòng).` });
    });
});

// 7. Xóa 1 dòng Outbound (chi tiết) theo ID
app.delete('/api/outbound/:id', (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Thiếu ID' });
    const sql = 'DELETE FROM outbound WHERE id = ?';
    connection.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã xóa thành công dòng chi tiết!` });
    });
});

// --- API: Quan ly Import Shipment (CLP) ---

// 1. Lay danh sach Import Shipment
app.get('/api/importshipment', (req, res) => {
    const { q, cont, shipmentorder, jobno, jobno_shp } = req.query;
    let sql = 'SELECT * FROM importshipment';
    let params = [];
    let conditions = [];

    if (q) {
        conditions.push('(jobno LIKE ? OR ponumber LIKE ? OR sku LIKE ? OR cont LIKE ? OR shipmentorder LIKE ? OR jobno_shp LIKE ?)');
        const k = `%${q}%`;
        params.push(k, k, k, k, k, k);
    }
    if (cont) {
        conditions.push('cont LIKE ?');
        params.push(`%${cont}%`);
    }
    if (shipmentorder) {
        conditions.push('shipmentorder LIKE ?');
        params.push(`%${shipmentorder}%`);
    }
    // Lọc theo Job No từ dropdown (kiểm tra cả jobno và jobno_shp)
    if (jobno) {
        conditions.push('(jobno = ? OR jobno_shp = ?)');
        params.push(jobno, jobno);
    }
    // Lọc riêng theo trường jobno_shp từ ô input
    if (jobno_shp) {
        conditions.push('jobno_shp LIKE ?');
        params.push(`%${jobno_shp}%`);
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY id DESC LIMIT 1000';
    connection.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Import du lieu Shipment tu Excel
app.post('/api/importshipment/import', async (req, res) => {
    const data = req.body;
    if (!Array.isArray(data) || data.length === 0) return res.status(400).json({ error: "Dữ liệu không hợp lệ" });

    try {
        // 1. Lấy thông tin CBM từ Master Data để mapping tự động dựa trên SKU
        const [masterdata] = await connection.promise().query('SELECT sku, cbm FROM masterdata');
        const skuMap = new Map();
        masterdata.forEach(m => skuMap.set(m.sku, parseFloat(m.cbm) || 0));

        const sql = `INSERT INTO importshipment (
            jobno, relese_key, ponumber, sku, finaldc, hubdc, 
            systempallet, measurement, weight, cbm_pallet, carton, 
            palletnumber, cont, seal, shipmentorder, loosecarton, cbm, jobno_shp
        ) VALUES ?`;

        const values = data.map(d => {
            const qty = parseInt(d.carton) || 0;
            const unitCbm = skuMap.get(d.sku) || 0;                  // CBM đơn vị từ Master Data
            const totalCbm = qty * unitCbm;                          // cbm = qty * unitcbm
            // cbm_pallet lấy đúng cột CBM trong Excel (hỗ trợ viết hoa/thường)
            const cbmPallet = parseFloat(
                d.cbm_pallet !== undefined ? d.cbm_pallet : (d.cbm !== undefined ? d.cbm : d.CBM)
            ) || 0;

            return [
                d.jobno || '', 
                d.relese_key || '', 
                d.ponumber || '', 
                d.sku || '', 
                d.finaldc || '', 
                d.hubdc || '', 
                d.systempallet || '', 
                d.measurement || '', 
                parseFloat(d.weight) || 0, 
                cbmPallet,                                      // cbm_pallet: lấy từ cột cbm/CBM/cbm_pallet trong Excel
                qty, 
                d.palletnumber || '', 
                d.cont || '', 
                d.seal || '', 
                d.shipmentorder || '', 
                parseInt(d.loosecarton) || 0,
                totalCbm,                     // cbm: qty * unitcbm
                d.jobno_shp || ''
            ];
        });

        const [result] = await connection.promise().query(sql, [values]);
        res.json({ message: `Đã import thành công ${result.affectedRows} dòng shipment.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi Import Shipment: ' + err.message });
    }
});

// 3. Lấy danh sách Job No có Container dựa trên ngày đóng hàng (từ outbound)
app.get('/api/importshipment/jobs-by-date', (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "Thiếu ngày đóng hàng" });
    
    // Lấy thông tin Job, Cont, Seal từ bảng outbound để hiển thị trong combo
    const sql = "SELECT DISTINCT jobno, container, seal FROM outbound WHERE datestuff = ? AND container IS NOT NULL AND container <> ''";
    connection.query(sql, [date], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 4. Cập nhật Shipment Order (Shipment ID) theo Job No
app.put('/api/importshipment/update-order', (req, res) => {
    const { jobno, shipmentorder, cont, seal, jobno_shp } = req.body; // Nhận dữ liệu từ clp.html gửi lên
    if (!jobno) return res.status(400).json({ error: "Thiếu Job No" });

    // Thực hiện cập nhật đồng thời các thông tin cho toàn bộ các dòng thuộc Job đó
    const sql = "UPDATE importshipment SET shipmentorder = ?, cont = ?, seal = ?, jobno_shp = ? WHERE jobno = ?";
    connection.query(sql, [shipmentorder, cont, seal, jobno_shp, jobno], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã cập nhật Shipment ID cho Job ${jobno} (${result.affectedRows} dòng).` });
    });
});

// 5. Xóa toàn bộ dữ liệu Shipment theo Job No
app.delete('/api/importshipment/job/:jobno', (req, res) => {
    const { jobno } = req.params;
    if (!jobno) return res.status(400).json({ error: 'Thiếu Job No' });

    const sql = 'DELETE FROM importshipment WHERE jobno = ?';
    connection.query(sql, [jobno], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã xóa thành công ${result.affectedRows} dòng Shipment của Job ${jobno}` });
    });
});

// 6. Xóa toàn bộ dữ liệu Shipment theo Shipment Order (Shipment ID)
app.delete('/api/importshipment/shipment/:shipmentorder', (req, res) => {
    const { shipmentorder } = req.params;
    if (!shipmentorder) return res.status(400).json({ error: 'Thiếu Shipment ID' });

    const sql = 'DELETE FROM importshipment WHERE shipmentorder = ?';
    connection.query(sql, [shipmentorder], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã xóa thành công ${result.affectedRows} dòng của Shipment ID: ${shipmentorder}` });
    });
});

// --- API: Lay danh sach Job No chua co so Container tu Outbound ---
app.get('/api/outbound/dropdown/jobs-no-cont', (req, res) => {
    const sql = `
        SELECT DISTINCT jobno
        FROM outbound
        WHERE jobno IS NOT NULL
          AND TRIM(jobno) <> ''
          AND (container IS NULL OR TRIM(container) = '')
        ORDER BY jobno DESC
    `;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- API: Lay chi tiet SKU va kich thuoc tu Master Data theo Job No (Outbound) ---
app.get('/api/outbound/skus-details/:jobno', (req, res) => {
    const jobno = req.params.jobno;
    const sql = `
        SELECT o.sku, o.carton as qty, o.fdc, m.length, m.width, m.height, m.weight 
        FROM outbound o 
        LEFT JOIN masterdata m ON o.sku = m.sku 
        WHERE o.jobno = ?
          AND TRIM(COALESCE(o.sku, '')) <> '0'`;
    connection.query(sql, [jobno], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- API: Lay chi tiet SKU va kich thuoc tu Master Data theo Job No (Outbound) ---
app.get('/api/outbound/skus-details/:jobno', (req, res) => {
    const jobno = req.params.jobno;
    const sql = `
        SELECT o.sku, o.carton as qty, o.fdc, m.length, m.width, m.height, m.weight 
        FROM outbound o 
        LEFT JOIN masterdata m ON o.sku = m.sku 
        WHERE o.jobno = ?
          AND TRIM(COALESCE(o.sku, '')) <> '0'`;
    connection.query(sql, [jobno], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 5. Đổi tên Job No (Bulk Update cho toàn bộ Job)
app.put('/api/outbound/rename-job', (req, res) => {
    const { oldJobNo, newJobNo } = req.body;
    if (!oldJobNo || !newJobNo) return res.status(400).json({ error: 'Thiếu thông tin Job No cũ hoặc mới' });

    const sql = 'UPDATE outbound SET jobno = ? WHERE jobno = ?';
    connection.query(sql, [newJobNo, oldJobNo], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã đổi tên Job ${oldJobNo} thành ${newJobNo} (${result.affectedRows} dòng).` });
    });
});

// 6. Xóa toàn bộ Job No
app.delete('/api/outbound/job/:jobno', (req, res) => {
    const { jobno } = req.params;
    if (!jobno) return res.status(400).json({ error: 'Thiếu Job No' });

    const sql = 'DELETE FROM outbound WHERE jobno = ?';
    connection.query(sql, [jobno], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã xóa Job ${jobno} thành công (${result.affectedRows} dòng).` });
    });
});

// --- API: Truy van giao dich theo SKU (Inbound & Outbound) ---
app.get('/api/transactions/sku/:sku', (req, res) => {
    const sku = req.params.sku;
    if (!sku) return res.status(400).json({ error: 'Thiếu SKU' });

    const result = { inbound: [], outbound: [] };

    // 1. Lay thong tin Inbound
    const sqlIn = 'SELECT datercv, po, contxe, carton FROM inbound WHERE sku = ? ORDER BY datercv DESC';
    connection.query(sqlIn, [sku], (err, inRows) => {
        if (err) return res.status(500).json({ error: err.message });
        result.inbound = inRows;

        // 2. Lay thong tin Outbound
        const sqlOut = 'SELECT jobno, datercv, parentpo, childpo, container, datestuff, carton FROM outbound WHERE sku = ? ORDER BY datestuff DESC, datercv DESC';
        connection.query(sqlOut, [sku], (err, outRows) => {
            if (err) return res.status(500).json({ error: err.message });
            result.outbound = outRows;
            
            res.json(result);
        });
    });
});

// --- API: Quan ly Scan File Data ---

// 1. Lay danh sach data scan (Limit 500 dong moi nhat)
app.get('/api/scanfile', (req, res) => {
    const { q, jobno, noCont, pallet_type } = req.query;
    const { exactJobno } = req.query; // Thêm tham số mới để tìm kiếm chính xác Job No
    // Join voi outbound de kiem tra trang thai container cua Job
    let sql = `
        SELECT s.* 
        FROM scanfile s
        LEFT JOIN (SELECT jobno, MAX(container) as container FROM outbound GROUP BY jobno) o ON s.jobno = o.jobno
    `;
    let params = [];
    let conditions = [];

    if (q) {
        conditions.push('(s.jobno LIKE ? OR s.sscc LIKE ? OR s.sku LIKE ? OR s.barcode LIKE ?)');
        const k = `%${q}%`;
        params.push(k, k, k, k);
    }
    if (jobno) { conditions.push('s.jobno = ?'); params.push(jobno); }
    if (noCont === 'true') { conditions.push("(o.container IS NULL OR TRIM(o.container) = '')"); }
    if (pallet_type) { conditions.push('s.pallet_type = ?'); params.push(pallet_type); }
    if (exactJobno) { conditions.push('s.jobno = ?'); params.push(exactJobno); } // Điều kiện tìm kiếm chính xác Job No

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');

    sql += ' ORDER BY s.id DESC LIMIT 500';
    connection.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 1b. Lấy tổng qty pallet loose theo danh sách Job No (để export CLP)
app.get('/api/scanfile/loose-qty', (req, res) => {
    const { jobs } = req.query; // comma separated
    if (!jobs) return res.json({});

    const jobArr = jobs.split(',').map(j => j.trim()).filter(Boolean);
    if (jobArr.length === 0) return res.json({});

    const placeholders = jobArr.map(() => '?').join(',');
    const sql = `SELECT jobno, COUNT(*) AS looseqty 
                 FROM scanfile 
                 WHERE pallet_type = 'loose' AND jobno IN (${placeholders})
                 GROUP BY jobno`;

    connection.query(sql, jobArr, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        const map = {};
        results.forEach(r => map[r.jobno] = r.looseqty || 0);
        res.json(map);
    });
});

// 2. Import du lieu tu nhieu file Excel
app.post('/api/scanfile/import', async (req, res) => {
    const data = req.body; // Mang JSON gom tat ca cac dong tu cac file
    if (!Array.isArray(data) || data.length === 0) return res.status(400).json({ error: "Dữ liệu không hợp lệ" });

    try {
        const sql = `INSERT INTO scanfile (
            release_key, sscc, master_delivery, qty, master_ctl, master_st_company, 
            master_add1, master_add2, master_add3, master_add4, ship_to, st_zip, 
            barcode, sku, jobno, jobno_type, tag_label, pallet, time_scan, 
            pallet_type, jobscan, status, userscan, finish, confirm
        ) VALUES ?`;

        // Map du lieu tu JSON sang mang de Bulk Insert
        const values = data.map(d => [
            d.release_key || '', d.sscc || '', d.master_delivery || '', parseInt(d.qty) || 0, 
            d.master_ctl || '', d.master_st_company || '', d.master_add1 || '', d.master_add2 || '', 
            d.master_add3 || '', d.master_add4 || '', d.ship_to || '', d.st_zip || '', 
            d.barcode || '', d.sku || '', d.jobno || '', d.jobno_type || '', 
            d.tag_label || '', d.pallet || '', d.time_scan || null, 
            d.pallet_type || '', d.jobscan || '', d.status || '', 
            d.userscan || '', d.finish || '', d.confirm || ''
        ]);

        const [result] = await connection.promise().query(sql, [values]);
        res.json({ message: `Đã import thành công ${result.affectedRows} dòng dữ liệu.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi Import: ' + err.message });
    }
});

// API cung cấp template CLP xuất Excel (PL)
app.get('/api/clp/template', (req, res) => {
    const templatePath = path.resolve(__dirname, 'static/clp_export_template.xlsx');
    if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ error: 'Không tìm thấy file template CLP' });
    }
    res.sendFile(templatePath);
});

// API template EDI container
app.get('/api/clp/template-container', (req, res) => {
    const templatePath = path.resolve(__dirname, 'static/clp_export_container_template.xlsx');
    if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ error: 'Không tìm thấy file template EDI' });
    }
    res.sendFile(templatePath);
});

// 3. Xóa dữ liệu scanfile theo Job No
app.delete('/api/scanfile/job/:jobno', (req, res) => {
    const { jobno } = req.params;
    if (!jobno) return res.status(400).json({ error: 'Thiếu Job No' });

    const sql = 'DELETE FROM scanfile WHERE jobno = ?';
    connection.query(sql, [jobno], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Đã xóa ${result.affectedRows} dòng của Job ${jobno}` });
    });
});

// 4. API Đối soát SKU giữa Outbound và Scanfile
app.get('/api/scanfile/comparison', (req, res) => {
    const sql = `
        SELECT 
            COALESCE(ob.jobno, sf.jobno) as jobno,
            COALESCE(ob.sku, sf.sku) as sku,
            IFNULL(ob.planned_cartons, 0) as planned, 
            IFNULL(sf.scanned_qty, 0) as scanned
        FROM (
            SELECT jobno, sku, SUM(carton) as planned_cartons 
            FROM outbound 
            WHERE container IS NULL OR TRIM(container) = ''
            GROUP BY jobno, sku
        ) ob
        LEFT JOIN (
            SELECT jobno, sku, SUM(qty) as scanned_qty 
            FROM scanfile 
            GROUP BY jobno, sku
        ) sf ON ob.jobno = sf.jobno AND ob.sku = sf.sku
        UNION
        SELECT 
            COALESCE(ob.jobno, sf.jobno) as jobno,
            COALESCE(ob.sku, sf.sku) as sku,
            IFNULL(ob.planned_cartons, 0) as planned,
            IFNULL(sf.scanned_qty, 0) as scanned
        FROM (
            SELECT jobno, sku, SUM(carton) as planned_cartons 
            FROM outbound 
            WHERE container IS NULL OR TRIM(container) = ''
            GROUP BY jobno, sku
        ) ob
        RIGHT JOIN (
            SELECT jobno, sku, SUM(qty) as scanned_qty 
            FROM scanfile 
            GROUP BY jobno, sku
        ) sf ON ob.jobno = sf.jobno AND ob.sku = sf.sku 
        WHERE ob.jobno IS NULL
        ORDER BY jobno DESC, sku ASC`;

    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- API: Đối soát TỔNG SỐ SKU giữa Outbound và Scanfile ---
app.get('/api/scanfile/sku-comparison', (req, res) => {
    const sql = `
        SELECT 
            COALESCE(ob.jobno, sf.jobno) as jobno,
            IFNULL(ob.total_skus, 0) as planned_skus,
            IFNULL(sf.total_skus, 0) as scanned_skus
        FROM (
            SELECT jobno, COUNT(DISTINCT sku) as total_skus
            FROM outbound
            WHERE container IS NULL OR TRIM(container) = ''
            GROUP BY jobno
        ) ob
        LEFT JOIN (
            SELECT jobno, COUNT(DISTINCT sku) as total_skus
            FROM scanfile
            GROUP BY jobno
        ) sf ON ob.jobno = sf.jobno
        UNION
        SELECT 
            COALESCE(ob.jobno, sf.jobno) as jobno,
            IFNULL(ob.total_skus, 0) as planned_skus,
            IFNULL(sf.total_skus, 0) as scanned_skus
        FROM (
            SELECT jobno, COUNT(DISTINCT sku) as total_skus
            FROM outbound
            WHERE container IS NULL OR TRIM(container) = ''
            GROUP BY jobno
        ) ob
        RIGHT JOIN (
            SELECT jobno, COUNT(DISTINCT sku) as total_skus
            FROM scanfile
            GROUP BY jobno
        ) sf ON ob.jobno = sf.jobno
        WHERE ob.jobno IS NULL
        ORDER BY jobno DESC`;

    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- API: Liệt kê danh sách file trong thư mục uploads ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir); // Tự động tạo thư mục nếu chưa có

app.get('/api/files', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Không thể đọc thư mục uploads' });
        res.json(files);
    });
});

// --- CỤM API DASHBOARD ---

// 1. Thống kê tổng quát
app.get('/api/dashboard/stats', (req, res) => {
    const sql = `
        SELECT 
            (SELECT COUNT(*) FROM masterdata) as total_products,
            (SELECT IFNULL(SUM(carton), 0) FROM inbound WHERE datercv = CURDATE()) as inbound_today,
            (SELECT IFNULL(SUM(cbm), 0) FROM inbound WHERE datercv = CURDATE()) as inbound_today_cbm,
            (SELECT IFNULL(SUM(carton), 0) FROM inbound WHERE YEARWEEK(datercv, 1) = YEARWEEK(CURDATE(), 1)) as inbound_week,
            (SELECT IFNULL(SUM(cbm), 0) FROM inbound WHERE YEARWEEK(datercv, 1) = YEARWEEK(CURDATE(), 1)) as inbound_week_cbm,
            (SELECT IFNULL(SUM(carton), 0) FROM outbound WHERE YEARWEEK(datestuff, 1) = YEARWEEK(CURDATE(), 1)) as outbound_week,
            (SELECT IFNULL(SUM(cbm), 0) FROM outbound WHERE YEARWEEK(datestuff, 1) = YEARWEEK(CURDATE(), 1)) as outbound_week_cbm,
            (SELECT IFNULL(SUM(carton), 0) FROM outbound WHERE YEARWEEK(datestuff, 1) = YEARWEEK(DATE_SUB(CURDATE(), INTERVAL 1 WEEK), 1)) as outbound_last_week,
            (SELECT IFNULL(SUM(cbm), 0) FROM outbound WHERE YEARWEEK(datestuff, 1) = YEARWEEK(DATE_SUB(CURDATE(), INTERVAL 1 WEEK), 1)) as outbound_last_week_cbm,
            (SELECT COUNT(DISTINCT container) FROM outbound WHERE YEARWEEK(datestuff, 1) = YEARWEEK(CURDATE(), 1) AND container IS NOT NULL AND container <> '') as outbound_week_cont,
            (SELECT COUNT(DISTINCT container) FROM outbound WHERE YEARWEEK(datestuff, 1) = YEARWEEK(DATE_SUB(CURDATE(), INTERVAL 1 WEEK), 1) AND container IS NOT NULL AND container <> '') as outbound_last_week_cont,
            (SELECT COUNT(*) FROM masterdata WHERE quantity < 10) as alerts,
            (SELECT IFNULL(SUM(qty), 0) FROM bbrreport WHERE YEARWEEK(deliverydate, 1) = YEARWEEK(CURDATE(), 1)) as forecast_this_week,
            (SELECT IFNULL(SUM(b.qty * m.cbm), 0) FROM bbrreport b JOIN masterdata m ON b.item = m.sku WHERE YEARWEEK(b.deliverydate, 1) = YEARWEEK(CURDATE(), 1)) as forecast_this_week_cbm,
            (SELECT IFNULL(SUM(qty), 0) FROM bbrreport WHERE YEARWEEK(deliverydate, 1) = YEARWEEK(DATE_ADD(CURDATE(), INTERVAL 1 WEEK), 1)) as forecast_next_week,
            (SELECT IFNULL(SUM(b.qty * m.cbm), 0) FROM bbrreport b JOIN masterdata m ON b.item = m.sku WHERE YEARWEEK(b.deliverydate, 1) = YEARWEEK(DATE_ADD(CURDATE(), INTERVAL 1 WEEK), 1)) as forecast_next_week_cbm,
            (SELECT IFNULL(SUM(cbm), 0) FROM outbound WHERE container IS NULL OR TRIM(container) = '') as outbound_no_cont_cbm
    `;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results[0]);
    });
});

// 2. Chi tiết hàng nhập theo từng ngày trong tuần
app.get('/api/dashboard/weekly-breakdown', (req, res) => {
    const sql = `
        SELECT 
            ANY_VALUE(DATE_FORMAT(datercv, '%Y-%m-%d')) as date,
            ANY_VALUE(DAYNAME(datercv)) as day_name,
            IFNULL(SUM(carton), 0) as total_carton,
            IFNULL(SUM(cbm), 0) as total_cbm
        FROM inbound 
        WHERE YEARWEEK(datercv, 1) = YEARWEEK(CURDATE(), 1)
        GROUP BY DATE(datercv)
        ORDER BY DATE(datercv) ASC
    `;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 3. Xu hướng CBM 7 ngày gần nhất (cho biểu đồ đường)
app.get('/api/dashboard/inbound-trend', (req, res) => {
    const sql = `
        SELECT 
            ANY_VALUE(DATE_FORMAT(datercv, '%d/%m')) as date_label,
            IFNULL(SUM(cbm), 0) as total_cbm
        FROM inbound 
        WHERE datercv >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(datercv)
        ORDER BY DATE(datercv) ASC
    `;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 4. Tỷ lệ CBM theo Nhà cung cấp (cho biểu đồ hình tròn)
app.get('/api/dashboard/inbound-cbm-by-supplier', (req, res) => {
    const sql = `
        SELECT
            ANY_VALUE(IFNULL(n.name_doc, i.MANCC)) as supplier_name,
            IFNULL(SUM(i.cbm), 0) as total_cbm
        FROM inbound i
        LEFT JOIN nhacungcap n ON i.MANCC = n.MANCC
        WHERE MONTH(i.datercv) = MONTH(CURDATE()) AND YEAR(i.datercv) = YEAR(CURDATE())
        GROUP BY i.MANCC
        ORDER BY total_cbm DESC
    `;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 5. Xu hướng Filling Rate 4 tuần gần nhất (cho biểu đồ cột)
app.get('/api/dashboard/filling-rate-trend', (req, res) => {
    const sql = `
        SELECT
            ANY_VALUE(CONCAT('Tuần ', RIGHT(YEARWEEK(datestuff, 1), 2))) as week_label,
            IFNULL(SUM(cbm), 0) as total_cbm,
            COUNT(DISTINCT container) as total_cont,
            YEARWEEK(datestuff, 1) as week_id
        FROM outbound
        WHERE datestuff >= DATE_SUB(CURDATE(), INTERVAL 4 WEEK)
          AND container IS NOT NULL AND container <> ''
        GROUP BY YEARWEEK(datestuff, 1)
        ORDER BY week_id ASC
    `;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        const data = results.map(r => ({
            week_label: r.week_label,
            filling_rate: r.total_cont > 0 ? (r.total_cbm / r.total_cont) : 0
        }));
        res.json(data);
    });
});

// --- API: Quản lý Pallet (Nhập Pallet) ---

// 1. Lấy danh sách loại Pallet (để đổ vào dropdown)
app.get('/api/pallet-types', (req, res) => {
    connection.query('SELECT * FROM pallet_type', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Thêm mới loại Pallet
app.post('/api/pallet-types', (req, res) => {
    const { pallet_size } = req.body;
    if (!pallet_size) return res.status(400).json({ error: 'Thiếu kích thước pallet' });
    connection.query('INSERT INTO pallet_type (pallet_size) VALUES (?)', [pallet_size], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Thêm loại pallet thành công!', id: result.insertId });
    });
});

// 3. Lấy danh sách nhập pallet (JOIN với loại pallet)
app.get('/api/pallets', (req, res) => {
    const sql = `
        SELECT pi.*, pt.pallet_size as pallet_name 
        FROM pallet_in pi 
        LEFT JOIN pallet_type pt ON pi.pallet_type_id = pt.id 
        ORDER BY pi.trans_date DESC, pi.id DESC`;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 4. Thêm mới bản ghi nhập pallet
app.post('/api/pallets', (req, res) => {
    const { trans_date, pallet_type_id, quantity, ghichu } = req.body;
    const sql = 'INSERT INTO pallet_in (trans_date, pallet_type_id, quantity, ghichu) VALUES (?, ?, ?, ?)';
    connection.query(sql, [trans_date, pallet_type_id, quantity, ghichu], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Thêm mới thành công!', id: result.insertId });
    });
});

// 5. Xóa bản ghi
app.delete('/api/pallets/:id', (req, res) => {
    connection.query('DELETE FROM pallet_in WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Đã xóa thành công!' });
    });
});

// --- API: Quản lý Xuất Pallet (Pallet Out) ---

// 1. Lấy danh sách xuất pallet
app.get('/api/pallets/out', (req, res) => {
    const sql = `
        SELECT po.*, pt.pallet_size as pallet_name 
        FROM pallet_out po 
        LEFT JOIN pallet_type pt ON po.pallet_type_id = pt.id 
        ORDER BY po.trans_date DESC, po.id DESC`;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Thêm mới bản ghi xuất pallet
app.post('/api/pallets/out', (req, res) => {
    const { trans_date, pallet_type_id, quantity } = req.body;
    const sql = 'INSERT INTO pallet_out (trans_date, pallet_type_id, quantity) VALUES (?, ?, ?)';
    connection.query(sql, [trans_date, pallet_type_id, quantity], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Xuất pallet thành công!', id: result.insertId });
    });
});

// 3. Xóa bản ghi xuất pallet
app.delete('/api/pallets/out/:id', (req, res) => {
    connection.query('DELETE FROM pallet_out WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Đã xóa thành công!' });
    });
});

// --- API: Quản lý TCR (Trouble Case Report) ---

// 1. Lấy danh sách TCR
app.get('/api/tcr', (req, res) => {
    const { q } = req.query;
    let sql = 'SELECT t.*, n.TENNCC, n.name_doc FROM TCR t LEFT JOIN nhacungcap n ON t.idsupplier = n.MANCC';
    let params = [];
    
    if (q) {
        sql += ' WHERE t.parentpo LIKE ? OR t.sku LIKE ? OR t.idsupplier LIKE ? OR n.TENNCC LIKE ? OR n.name_doc LIKE ?';
        const k = `%${q}%`;
        params.push(k, k, k, k, k);
    }
    sql += ' ORDER BY t.id DESC';
    
    connection.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Thêm mới bản ghi TCR
app.post('/api/tcr', (req, res) => {
    const d = req.body;
    if (!d.parentpo || !d.sku) return res.status(400).json({ error: 'Thiếu Parent PO hoặc SKU' });
    const sql = `INSERT INTO TCR (parentpo, sku, idsupplier, datercv, datesolve, carton, remark, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const v = [d.parentpo, d.sku, d.idsupplier, d.datercv, d.datesolve, d.carton, d.remark, d.status];
    connection.query(sql, v, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Thêm mới thành công!', id: result.insertId });
    });
});

// 3. Cập nhật bản ghi TCR
app.put('/api/tcr', (req, res) => {
    const d = req.body;
    if (!d.id) return res.status(400).json({ error: 'Thiếu ID' });
    const sql = `UPDATE TCR SET parentpo=?, sku=?, idsupplier=?, datercv=?, datesolve=?, carton=?, remark=?, status=? WHERE id=?`;
    const v = [d.parentpo, d.sku, d.idsupplier, d.datercv, d.datesolve, d.carton, d.remark, d.status, d.id];
    connection.query(sql, v, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Cập nhật thành công!' });
    });
});

// 4. Xóa bản ghi TCR
app.delete('/api/tcr/:id', (req, res) => {
    connection.query('DELETE FROM TCR WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Đã xóa thành công!' });
    });
});

// --- API: Quản lý Follow ---

// 1. Lấy danh sách Follow
app.get('/api/follow', (req, res) => {
    const { q } = req.query;
    let sql = `
        SELECT f.*, 
               CASE WHEN EXISTS (SELECT 1 FROM inbound i WHERE i.po = f.new_parentPO LIMIT 1) THEN 'Y' ELSE 'N' END AS in_inbound
        FROM follow f
    `;
    let params = [];
    
    if (q) {
        sql += ' WHERE f.sku LIKE ? OR f.old_parentPO LIKE ? OR f.new_parentPO LIKE ? OR f.supplier LIKE ?';
        const k = `%${q}%`;
        params.push(k, k, k, k);
    }
    sql += ' ORDER BY f.id DESC';
    
    connection.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Thêm mới bản ghi Follow
app.post('/api/follow', (req, res) => {
    const d = req.body;
    if (!d.sku || !d.old_parentPO || !d.new_parentPO) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (SKU, Old PO, New PO)' });
    const sql = `INSERT INTO follow (sku, old_parentPO, new_parentPO, carton, status, supplier) VALUES (?, ?, ?, ?, ?, ?)`;
    const v = [d.sku, d.old_parentPO, d.new_parentPO, d.carton || 0, d.status || 0, d.supplier || null];
    connection.query(sql, v, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Thêm mới thành công!', id: result.insertId });
    });
});

// 3. Cập nhật bản ghi Follow
app.put('/api/follow', (req, res) => {
    const d = req.body;
    if (!d.id) return res.status(400).json({ error: 'Thiếu ID' });
    const sql = `UPDATE follow SET sku=?, old_parentPO=?, new_parentPO=?, carton=?, status=?, supplier=? WHERE id=?`;
    const v = [d.sku, d.old_parentPO, d.new_parentPO, d.carton || 0, d.status || 0, d.supplier || null, d.id];
    connection.query(sql, v, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Cập nhật thành công!' });
    });
});

// 4. Xóa bản ghi Follow
app.delete('/api/follow/:id', (req, res) => {
    connection.query('DELETE FROM follow WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Đã xóa thành công!' });
    });
});

// --- Xu ly loi 404 (Khi khong tim thay API hoac Trang) ---
app.use((req, res) => {
  console.log(`❌ [LOI 404] Khong tim thay: ${req.method} ${req.url}`);
  res.status(404).json({ error: `Đường dẫn không tồn tại: ${req.method} ${req.url}` });
});

// Thay vì viết app.listen(3000, ...), bạn truyền biến 'port' vào đây
const server = app.listen(port, () => {
  console.log(`=============================================`);
  console.log(`🚀 SERVER DA KHOI DONG THANH CONG!`);
  console.log(`📡 Truy cap tai: http://localhost:${port}`);
  console.log(`=============================================`);
});

// Bat loi neu cong dang bi chiem dung (EADDRINUSE)
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`❌ [LOI] Cổng ${port} đang bị phần mềm khác chiếm dụng!`);
    console.error(`👉 Hãy tắt các cửa sổ CMD khác hoặc đổi cổng trong file run.bat`);
  } else {
    console.error('❌ [LOI] Server gặp lỗi khi khởi động:', e);
  }
});
