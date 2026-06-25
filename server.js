require("dotenv").config();
const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// =============================================
// KẾT NỐI DATABASE
// =============================================
const dbConfig = {
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD || "123456",
  server: process.env.DB_SERVER || "localhost",
  database: process.env.DB_DATABASE || "QUANLYQUANCAFE",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then((pool) => { console.log("✅ Connected to MSSQL"); return pool; })
  .catch((err) => console.error("❌ Database Connection Failed:", err));

// =============================================
// HELPER: GỬI THÔNG BÁO
// Khớp với cấu trúc bảng THONGBAO mới (MAKH | MANV)
// =============================================

// Gửi thông báo cho KHÁCH HÀNG (dùng MAKH)
async function notifyCustomer(pool, makh, noidung) {
  await pool.request()
    .input("makh", sql.Int, makh)
    .input("noidung", sql.NVarChar, noidung)
    .query(`INSERT INTO THONGBAO (MAKH, ROLE, NOIDUNG) 
            VALUES (@makh, 'CUSTOMER', @noidung)`);
}

// Gửi thông báo cho NHÂN VIÊN hoặc QUẢN LÝ (dùng MANV)
async function notifyStaff(pool, manv, role, noidung) {
  await pool.request()
    .input("manv", sql.VarChar, manv)
    .input("role", sql.VarChar, role)
    .input("noidung", sql.NVarChar, noidung)
    .query(`INSERT INTO THONGBAO (MANV, ROLE, NOIDUNG) 
            VALUES (@manv, @role, @noidung)`);
}

// Gửi thông báo cho TẤT CẢ nhân viên của 1 chi nhánh
async function notifyBranchStaff(pool, macn, noidung) {
  const result = await pool.request()
    .input("macn", sql.VarChar, macn)
    .query(`SELECT MANV, CHUCVU FROM NHANVIEN WHERE MACN = @macn`);
  for (const nv of result.recordset) {
    const role = nv.CHUCVU === "Quản lý" ? "ADMIN" : "STAFF";
    await notifyStaff(pool, nv.MANV, role, noidung);
  }
}

// Gửi thông báo cho TẤT CẢ quản lý (admin) trong hệ thống
async function notifyAllAdmins(pool, noidung) {
  const result = await pool.request()
    .query(`SELECT MANV FROM NHANVIEN WHERE CHUCVU = N'Quản lý'`);
  for (const admin of result.recordset) {
    await notifyStaff(pool, admin.MANV, "ADMIN", noidung);
  }
}

// =============================================
// 1. AUTH — ĐĂNG NHẬP
// =============================================
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const pool = await poolPromise;

    // Kiểm tra nhân viên / quản lý
    const nvResult = await pool.request()
      .input("username", sql.VarChar, username)
      .input("password", sql.VarChar, password)
      .query(`SELECT * FROM NHANVIEN WHERE MANV = @username AND MATKHAU = @password`);

    if (nvResult.recordset.length > 0) {
      const nv = nvResult.recordset[0];
      const role = nv.CHUCVU === "Quản lý" ? "ADMIN" : "STAFF";
      let maca = null;

      // Chỉ nhân viên pha chế mới có ca làm việc
      if (role === "STAFF") {
        // Kiểm tra ca đang mở — tránh tạo ca mới khi login lại
        const caExist = await pool.request()
          .input("manv", sql.VarChar, nv.MANV)
          .query(`SELECT TOP 1 MACA FROM CALAMVIEC 
                  WHERE MANV = @manv AND GIORA IS NULL`);

        if (caExist.recordset.length > 0) {
          // Ca cũ còn mở → dùng lại
          maca = caExist.recordset[0].MACA;
        } else {
          // Tạo ca mới
          const caNew = await pool.request()
            .input("manv", sql.VarChar, nv.MANV)
            .query(`INSERT INTO CALAMVIEC (MANV) 
                    OUTPUT INSERTED.MACA VALUES (@manv)`);
          maca = caNew.recordset[0].MACA;
        }
      }

      return res.json({
        success: true,
        user: { id: nv.MANV, name: nv.TENNV, role, macn: nv.MACN, maca },
      });
    }

    // Kiểm tra khách hàng
    const khResult = await pool.request()
      .input("username", sql.VarChar, username)
      .input("password", sql.VarChar, password)
      .query(`SELECT * FROM KHACHHANG WHERE TAIKHOAN = @username AND MATKHAU = @password`);

    if (khResult.recordset.length > 0) {
      const kh = khResult.recordset[0];
      return res.json({
        success: true,
        user: { id: kh.MAKH, name: kh.TENKH, role: "CUSTOMER", points: kh.DIEMTICHLUY },
      });
    }

    res.status(401).json({ success: false, message: "Sai thông tin đăng nhập" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 2. AUTH — ĐĂNG KÝ (chỉ dành cho khách hàng)
// =============================================
app.post("/api/auth/register", async (req, res) => {
  try {
    const { tenkh, sdt, taikhoan, matkhau } = req.body;
    const pool = await poolPromise;

    const check = await pool.request()
      .input("taikhoan", sql.VarChar, taikhoan)
      .query(`SELECT MAKH FROM KHACHHANG WHERE TAIKHOAN = @taikhoan`);

    if (check.recordset.length > 0)
      return res.status(400).json({ success: false, message: "Tài khoản đã tồn tại" });

    await pool.request()
      .input("tenkh", sql.NVarChar, tenkh)
      .input("sdt", sql.VarChar, sdt)
      .input("taikhoan", sql.VarChar, taikhoan)
      .input("matkhau", sql.VarChar, matkhau)
      .query(`INSERT INTO KHACHHANG (TENKH, SDT, DIEMTICHLUY, TAIKHOAN, MATKHAU) 
              VALUES (@tenkh, @sdt, 0, @taikhoan, @matkhau)`);

    res.json({ success: true, message: "Đăng ký thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 3. AUTH — LẤY THÔNG TIN KHÁCH HÀNG (làm mới điểm)
// =============================================
app.get("/api/auth/me", async (req, res) => {
  try {
    const makh = req.query.makh;
    const pool = await poolPromise;
    const result = await pool.request()
      .input("makh", sql.Int, makh)
      .query(`SELECT DIEMTICHLUY FROM KHACHHANG WHERE MAKH = @makh`);
    if (result.recordset.length > 0)
      return res.json({ success: true, points: result.recordset[0].DIEMTICHLUY });
    res.json({ success: false });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// =============================================
// 4. SẢN PHẨM — XEM THỰC ĐƠN
// =============================================
app.get("/api/products", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT M.*, L.TENLOAI 
      FROM MONAN M 
      JOIN LOAI_MON L ON M.MALOAI = L.MALOAI
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 5. GIỎ HÀNG
// =============================================
app.get("/api/cart", async (req, res) => {
  try {
    const makh = req.query.makh;
    if (!makh) return res.status(400).json({ success: false, message: "Thiếu MAKH" });
    const pool = await poolPromise;
    const result = await pool.request()
      .input("makh", sql.Int, makh)
      .query(`SELECT G.*, M.TENMON, M.DONGIA 
              FROM GIOHANG_TAM G 
              JOIN MONAN M ON G.MAMON = M.MAMON 
              WHERE G.MAKH = @makh`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

app.post("/api/cart", async (req, res) => {
  try {
    const { makh, mamon, soluong } = req.body;
    const pool = await poolPromise;

    if (soluong <= 0) {
      await pool.request()
        .input("makh", sql.Int, makh)
        .input("mamon", sql.VarChar, mamon)
        .query(`DELETE FROM GIOHANG_TAM WHERE MAKH = @makh AND MAMON = @mamon`);
    } else {
      const check = await pool.request()
        .input("makh", sql.Int, makh)
        .input("mamon", sql.VarChar, mamon)
        .query(`SELECT MAKH FROM GIOHANG_TAM WHERE MAKH = @makh AND MAMON = @mamon`);

      if (check.recordset.length > 0) {
        await pool.request()
          .input("makh", sql.Int, makh)
          .input("mamon", sql.VarChar, mamon)
          .input("soluong", sql.Int, soluong)
          .query(`UPDATE GIOHANG_TAM SET SOLUONG = @soluong 
                  WHERE MAKH = @makh AND MAMON = @mamon`);
      } else {
        await pool.request()
          .input("makh", sql.Int, makh)
          .input("mamon", sql.VarChar, mamon)
          .input("soluong", sql.Int, soluong)
          .query(`INSERT INTO GIOHANG_TAM (MAKH, MAMON, SOLUONG) 
                  VALUES (@makh, @mamon, @soluong)`);
      }
    }
    res.json({ success: true, message: "Đã cập nhật giỏ hàng" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 6. THANH TOÁN (CHECKOUT)
// =============================================
app.post("/api/checkout", async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  try {
    const { user, cart, discount_points, loaidon, diachigiao, macn: clientMacn } = req.body;

    // Kiểm tra loại đơn và địa chỉ giao hàng
    let finalDiachi = null;
    if (loaidon === "Giao hàng") {
      if (!diachigiao || diachigiao.trim() === "")
        return res.status(400).json({ success: false, message: "Bắt buộc nhập địa chỉ giao hàng." });
      finalDiachi = diachigiao;
    } else if (loaidon !== "Mang đi") {
      return res.status(400).json({ success: false, message: "Loại đơn không hợp lệ." });
    }

    if (!cart || cart.length === 0)
      return res.status(400).json({ success: false, message: "Giỏ hàng trống." });

    await transaction.begin();

    // Tính tiền
    const totalItems = cart.reduce((sum, item) => sum + item.SOLUONG, 0);
    const totalAmount = cart.reduce((sum, item) => sum + item.SOLUONG * item.DONGIA, 0);

    let pointsUsed = parseInt(discount_points) || 0;
    let discountAmount = 0;

    // Kiểm tra điểm hợp lệ trước khi trừ
    if (pointsUsed === 1000 || pointsUsed === 2000) {
      const ptCheck = await new sql.Request(transaction)
        .input("makh", sql.Int, user.id)
        .query(`SELECT DIEMTICHLUY FROM KHACHHANG WHERE MAKH = @makh`);
      const currentPoints = ptCheck.recordset[0]?.DIEMTICHLUY || 0;
      if (currentPoints < pointsUsed) pointsUsed = 0;
      else discountAmount = pointsUsed === 1000 ? totalAmount * 0.1 : totalAmount * 0.2;
    } else {
      pointsUsed = 0;
    }

    const finalAmount = totalAmount - discountAmount;

    // Xác định MACA và MACN
    let maca = null;
    let macn = clientMacn || "CN01";
    let makh = null;

    if (user.role === "CUSTOMER") {
      makh = user.id;
      // Lấy ca nhân viên đang trực tại chi nhánh khách đã chọn
      const activeStaff = await new sql.Request(transaction)
        .input("macn", sql.VarChar, macn)
        .query(`SELECT TOP 1 C.MACA 
                FROM CALAMVIEC C 
                JOIN NHANVIEN N ON C.MANV = N.MANV 
                WHERE C.GIORA IS NULL AND N.MACN = @macn
                ORDER BY C.MACA DESC`);
      if (activeStaff.recordset.length > 0)
        maca = activeStaff.recordset[0].MACA;
    } else {
      // Nhân viên tự tạo đơn tại quầy
      macn = user.macn;
      maca = user.maca;
      if (!maca) {
        const caResult = await new sql.Request(transaction)
          .input("manv", sql.VarChar, user.id)
          .query(`INSERT INTO CALAMVIEC (MANV) OUTPUT INSERTED.MACA VALUES (@manv)`);
        maca = caResult.recordset[0].MACA;
      }
    }

    // Tạo hóa đơn
    const hdResult = await new sql.Request(transaction)
      .input("tongtien", sql.Int, finalAmount)
      .input("phuongthuc", sql.NVarChar, "Tiền mặt")
      .input("loaidon", sql.NVarChar, loaidon)
      .input("diachigiao", sql.NVarChar, finalDiachi)
      .input("macn", sql.VarChar, macn)
      .input("makh", sql.Int, makh)
      .input("maca", sql.Int, maca)
      .query(`INSERT INTO HOADON (TONGTIEN, TRANGTHAI, PHUONGTHUC, LOAIDON, DIACHIGIAO, MACN, MAKH, MACA)
              OUTPUT INSERTED.MAHD
              VALUES (@tongtien, N'Đang chuẩn bị', @phuongthuc, @loaidon, @diachigiao, @macn, @makh, @maca)`);
    const mahd = hdResult.recordset[0].MAHD;

    // Tạo chi tiết hóa đơn
    for (const item of cart) {
      await new sql.Request(transaction)
        .input("mahd", sql.Int, mahd)
        .input("mamon", sql.VarChar, item.MAMON)
        .input("soluong", sql.Int, item.SOLUONG)
        .input("thanhtien", sql.Int, item.SOLUONG * item.DONGIA)
        .query(`INSERT INTO CHITIETHOADON (MAHD, MAMON, SOLUONG, THANHTIEN) 
                VALUES (@mahd, @mamon, @soluong, @thanhtien)`);
    }

    // Cập nhật điểm tích lũy và xóa giỏ hàng (chỉ khách hàng)
    if (user.role === "CUSTOMER") {
      const pointsEarned = totalItems * 50;
      await new sql.Request(transaction)
        .input("makh", sql.Int, makh)
        .input("pointsUsed", sql.Int, pointsUsed)
        .input("pointsEarned", sql.Int, pointsEarned)
        .query(`UPDATE KHACHHANG 
                SET DIEMTICHLUY = DIEMTICHLUY - @pointsUsed + @pointsEarned
                WHERE MAKH = @makh;
                DELETE FROM GIOHANG_TAM WHERE MAKH = @makh;`);
    }

    await transaction.commit();

    // Thông báo cho nhân viên chi nhánh khi khách đặt đơn
    if (user.role === "CUSTOMER")
      await notifyBranchStaff(pool, macn, `Có đơn hàng mới #${mahd} vừa được tạo!`);

    res.json({ success: true, message: "Đặt hàng thành công", newMaca: maca });
  } catch (err) {
    console.error(err);
    try { await transaction.rollback(); } catch (_) { }
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================
// 7. ĐƠN HÀNG — XEM DANH SÁCH
// =============================================
app.get("/api/orders", async (req, res) => {
  try {
    const { role, id, macn } = req.query;
    const pool = await poolPromise;

    // Lấy danh sách đơn hàng theo role
    let orders = [];
    if (role === "CUSTOMER") {
      const r = await pool.request()
        .input("makh", sql.Int, id)
        .query(`SELECT * FROM HOADON WHERE MAKH = @makh ORDER BY NGAYLAP DESC`);
      orders = r.recordset;
    } else if (role === "STAFF") {
      const r = await pool.request()
        .input("macn", sql.VarChar, macn)
        .query(`SELECT * FROM HOADON WHERE MACN = @macn ORDER BY NGAYLAP DESC`);
      orders = r.recordset;
    } else if (role === "ADMIN") {
      const r = await pool.request()
        .query(`SELECT * FROM HOADON ORDER BY NGAYLAP DESC`);
      orders = r.recordset;
    } else {
      return res.status(403).json({ success: false, message: "Role không hợp lệ" });
    }

    // Lấy chi tiết và đánh giá cho từng đơn bằng 1 query JOIN
    if (orders.length > 0) {
      const mahdList = orders.map(o => o.MAHD).join(",");

      const ctResult = await pool.request().query(`
        SELECT C.MAHD, C.MAMON, C.SOLUONG, C.THANHTIEN, M.TENMON
        FROM CHITIETHOADON C
        JOIN MONAN M ON C.MAMON = M.MAMON
        WHERE C.MAHD IN (${mahdList})
      `);

      const dgResult = await pool.request().query(`
        SELECT * FROM DANHGIA WHERE MAHD IN (${mahdList})
      `);

      // Gắn chi tiết và đánh giá vào từng đơn
      const ctMap = {};
      const dgMap = {};
      ctResult.recordset.forEach(c => {
        if (!ctMap[c.MAHD]) ctMap[c.MAHD] = [];
        ctMap[c.MAHD].push(c);
      });
      dgResult.recordset.forEach(d => { dgMap[d.MAHD] = d; });

      orders.forEach(o => {
        o.details = ctMap[o.MAHD] || [];
        o.review = dgMap[o.MAHD] || null;
      });
    }

    res.json({ success: true, data: orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 8. ĐƠN HÀNG — HOÀN THÀNH
// =============================================
app.put("/api/orders/:id/complete", async (req, res) => {
  try {
    const mahd = req.params.id;
    const { maca, macn } = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("mahd", sql.Int, mahd)
      .input("maca", sql.Int, maca || null)
      .input("macn", sql.VarChar, macn || null)
      .query(`UPDATE HOADON 
              SET TRANGTHAI = N'Hoàn thành', MACA = @maca, MACN = @macn 
              WHERE MAHD = @mahd`);

    // Thông báo cho khách hàng khi đơn hoàn thành
    const hdInfo = await pool.request()
      .input("mahd", sql.Int, mahd)
      .query(`SELECT MAKH FROM HOADON WHERE MAHD = @mahd`);
    const makh = hdInfo.recordset[0]?.MAKH;
    if (makh) await notifyCustomer(pool, makh, `Đơn hàng #${mahd} của bạn đã hoàn thành!`);

    res.json({ success: true, message: "Đã hoàn thành đơn hàng" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 9. ĐÁNH GIÁ — GỬI ĐÁNH GIÁ
// =============================================
app.post("/api/reviews", async (req, res) => {
  try {
    const { mahd, makh, macn, sosao, noidung, hinhanh } = req.body;
    const pool = await poolPromise;

    // Kiểm tra đơn hàng hợp lệ và đã hoàn thành
    const hdCheck = await pool.request()
      .input("mahd", sql.Int, mahd)
      .input("makh", sql.Int, makh)
      .query(`SELECT MAHD FROM HOADON 
              WHERE MAHD = @mahd AND MAKH = @makh AND TRANGTHAI = N'Hoàn thành'`);
    if (hdCheck.recordset.length === 0)
      return res.status(400).json({ success: false, message: "Hóa đơn không hợp lệ hoặc chưa hoàn thành." });

    // Kiểm tra đã đánh giá chưa
    const dgCheck = await pool.request()
      .input("mahd", sql.Int, mahd)
      .query(`SELECT MAHD FROM DANHGIA WHERE MAHD = @mahd`);
    if (dgCheck.recordset.length > 0)
      return res.status(400).json({ success: false, message: "Đơn hàng này đã được đánh giá." });

    await pool.request()
      .input("mahd", sql.Int, mahd)
      .input("makh", sql.Int, makh)
      .input("macn", sql.VarChar, macn)
      .input("sosao", sql.Int, sosao)
      .input("noidung", sql.NVarChar, noidung || null)
      .input("hinhanh", sql.NVarChar, hinhanh || null)
      .query(`INSERT INTO DANHGIA (MAHD, MAKH, MACN, SOSAO, NOIDUNG, HINHANH) 
              VALUES (@mahd, @makh, @macn, @sosao, @noidung, @hinhanh)`);

    // Thông báo cho nhân viên chi nhánh có đánh giá mới
    await notifyBranchStaff(pool, macn, `Khách vừa đánh giá ${sosao} ⭐ cho đơn #${mahd}!`);

    res.json({ success: true, message: "Cảm ơn bạn đã đánh giá!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 10. ĐÁNH GIÁ — PHẢN HỒI CỦA NHÂN VIÊN
// =============================================
app.put("/api/reviews/:mahd/reply", async (req, res) => {
  try {
    const mahd = req.params.mahd;
    const { phanhoi } = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("mahd", sql.Int, mahd)
      .input("phanhoi", sql.NVarChar, phanhoi)
      .query(`UPDATE DANHGIA SET PHANHOI_CUA_QUAN = @phanhoi WHERE MAHD = @mahd`);

    // Thông báo ngược lại cho khách hàng
    const dgInfo = await pool.request()
      .input("mahd", sql.Int, mahd)
      .query(`SELECT MAKH FROM DANHGIA WHERE MAHD = @mahd`);
    const makh = dgInfo.recordset[0]?.MAKH;
    if (makh) await notifyCustomer(pool, makh, `Quán đã phản hồi đánh giá của bạn ở đơn #${mahd}`);

    res.json({ success: true, message: "Đã phản hồi đánh giá." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 11. BÁO CÁO DOANH THU (ADMIN)
// =============================================
app.get("/api/reports", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT MACN, SUM(TONGTIEN) AS TONGDOANHTHU 
      FROM HOADON 
      WHERE TRANGTHAI = N'Hoàn thành' 
      GROUP BY MACN
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 12. BÁO CÁO CA — XEM CHI TIẾT CA
// =============================================
app.get("/api/shift-report", async (req, res) => {
  try {
    const maca = req.query.maca;
    if (!maca) return res.status(400).json({ success: false, message: "Thiếu mã ca" });
    const pool = await poolPromise;

    const caReq = await pool.request()
      .input("maca", sql.Int, maca)
      .query(`SELECT GIOVAO FROM CALAMVIEC WHERE MACA = @maca`);
    if (caReq.recordset.length === 0)
      return res.status(404).json({ success: false, message: "Không tìm thấy ca" });

    const itemsReq = await pool.request()
      .input("maca", sql.Int, maca)
      .query(`SELECT M.TENMON, SUM(C.SOLUONG) AS SOLUONG, SUM(C.THANHTIEN) AS THANHTIEN 
              FROM CHITIETHOADON C 
              JOIN HOADON H ON C.MAHD = H.MAHD 
              JOIN MONAN M ON C.MAMON = M.MAMON 
              WHERE H.MACA = @maca AND H.TRANGTHAI = N'Hoàn thành' 
              GROUP BY M.TENMON`);

    const totalReq = await pool.request()
      .input("maca", sql.Int, maca)
      .query(`SELECT ISNULL(SUM(TONGTIEN), 0) AS TongTien, COUNT(MAHD) AS SoDonHang
              FROM HOADON WHERE MACA = @maca AND TRANGTHAI = N'Hoàn thành'`);

    res.json({
      success: true,
      data: {
        GIOVAO: caReq.recordset[0].GIOVAO,
        items: itemsReq.recordset,
        TongTien: totalReq.recordset[0].TongTien,
        SoDonHang: totalReq.recordset[0].SoDonHang,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 13. BÁO CÁO CA — NỘP BÁO CÁO
// =============================================
app.post("/api/shift-report/submit", async (req, res) => {
  try {
    const { maca, tongtien, manv, macn } = req.body;
    if (!maca) return res.status(400).json({ success: false, message: "Thiếu mã ca" });
    const pool = await poolPromise;

    await pool.request()
      .input("maca", sql.Int, maca)
      .input("tongtien", sql.Int, tongtien || 0)
      .query(`UPDATE CALAMVIEC SET GIORA = GETDATE(), TONGDOANHTHU = @tongtien 
              WHERE MACA = @maca`);

    // Thông báo cho tất cả quản lý
    const noidung = `Nhân viên ${manv || "?"} (CN: ${macn || "?"}) vừa nộp báo cáo ca #${maca}.`;
    await notifyAllAdmins(pool, noidung);

    res.json({ success: true, message: "Đã nộp báo cáo ca" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 14. BÁO CÁO CA — DANH SÁCH CA (ADMIN)
// =============================================
app.get("/api/admin/shift-reports", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT C.MACA, N.TENNV, N.MACN, C.GIOVAO, C.GIORA, C.TONGDOANHTHU,
             (SELECT COUNT(MAHD) FROM HOADON 
              WHERE MACA = C.MACA AND TRANGTHAI = N'Hoàn thành') AS SoDonHang
      FROM CALAMVIEC C
      JOIN NHANVIEN N ON C.MANV = N.MANV
      WHERE C.GIORA IS NOT NULL
      ORDER BY C.GIORA DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// =============================================
// 15. THÔNG BÁO — LẤY DANH SÁCH
// =============================================
app.get("/api/notifications", async (req, res) => {
  try {
    const { userid, role } = req.query;
    if (!userid || !role) return res.status(400).json({ success: false });
    const pool = await poolPromise;

    let result;
    if (role === "CUSTOMER") {
      // Khách hàng: query bằng MAKH
      result = await pool.request()
        .input("makh", sql.Int, parseInt(userid))
        .query(`SELECT TOP 20 * FROM THONGBAO 
                WHERE MAKH = @makh AND ROLE = 'CUSTOMER' 
                ORDER BY NGAYTAO DESC`);
    } else {
      // Nhân viên / Admin: query bằng MANV
      result = await pool.request()
        .input("manv", sql.VarChar, userid)
        .input("role", sql.VarChar, role)
        .query(`SELECT TOP 20 * FROM THONGBAO 
                WHERE MANV = @manv AND ROLE = @role 
                ORDER BY NGAYTAO DESC`);
    }

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// =============================================
// 16. THÔNG BÁO — ĐỌC 1 THÔNG BÁO
// =============================================
app.put("/api/notifications/:matb/read", async (req, res) => {
  try {
    const matb = req.params.matb;
    const pool = await poolPromise;
    await pool.request()
      .input("matb", sql.Int, matb)
      .query(`UPDATE THONGBAO SET TRANGTHAI_DOC = 1 WHERE MATB = @matb`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// =============================================
// 17. THÔNG BÁO — ĐỌC TẤT CẢ
// =============================================
app.put("/api/notifications/read-all", async (req, res) => {
  try {
    const { userid, role } = req.body;
    const pool = await poolPromise;

    if (role === "CUSTOMER") {
      await pool.request()
        .input("makh", sql.Int, parseInt(userid))
        .query(`UPDATE THONGBAO SET TRANGTHAI_DOC = 1 
                WHERE MAKH = @makh AND ROLE = 'CUSTOMER'`);
    } else {
      await pool.request()
        .input("manv", sql.VarChar, userid)
        .input("role", sql.VarChar, role)
        .query(`UPDATE THONGBAO SET TRANGTHAI_DOC = 1 
                WHERE MANV = @manv AND ROLE = @role`);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// =============================================
// KHỞI ĐỘNG SERVER
// =============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));