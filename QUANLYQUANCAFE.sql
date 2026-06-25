-- =============================================
-- HỆ THỐNG QUẢN LÝ QUÁN CAFE NEKO
-- Phiên bản: 2.0 (Đã chuẩn hóa)
-- =============================================

-- Xóa DB cũ nếu đã tồn tại (chạy lại từ đầu sạch sẽ)
IF EXISTS (SELECT name FROM sys.databases WHERE name = 'QUANLYQUANCAFE')
BEGIN
    ALTER DATABASE QUANLYQUANCAFE SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE QUANLYQUANCAFE;
END
GO

CREATE DATABASE QUANLYQUANCAFE;
GO

USE QUANLYQUANCAFE;
GO

-- =============================================
-- TẦNG 1: CÁC BẢNG ĐỘC LẬP (KHÔNG CÓ KHÓA NGOẠI)
-- =============================================

-- [1] BẢNG CHI NHÁNH
CREATE TABLE CHINHANH (
    MACN    VARCHAR(10)     PRIMARY KEY,
    TENCN   NVARCHAR(100)   NOT NULL,
    DIACHI  NVARCHAR(255)   NOT NULL,
    SDT     VARCHAR(15)     NOT NULL
);

-- [2] BẢNG KHÁCH HÀNG
CREATE TABLE KHACHHANG (
    MAKH        INT             IDENTITY(1,1) PRIMARY KEY,
    TENKH       NVARCHAR(50)    NOT NULL,
    SDT         VARCHAR(15)     NOT NULL,
    DIEMTICHLUY INT             DEFAULT 0,
    TAIKHOAN    VARCHAR(50)     UNIQUE NOT NULL,
    MATKHAU     VARCHAR(50)     NOT NULL
);

-- [3] BẢNG LOẠI MÓN
CREATE TABLE LOAI_MON (
    MALOAI  INT             IDENTITY(1,1) PRIMARY KEY,
    TENLOAI NVARCHAR(50)    NOT NULL
);

-- =============================================
-- TẦNG 2: CÁC BẢNG CÓ KHÓA NGOẠI BẬC 1
-- =============================================

-- [4] BẢNG NHÂN VIÊN
--     Ghi chú: CHUCVU chỉ nhận 2 giá trị hợp lệ: N'Quản lý' hoặc N'Pha chế'
CREATE TABLE NHANVIEN (
    MANV    VARCHAR(10)     PRIMARY KEY,
    TENNV   NVARCHAR(50)    NOT NULL,
    CHUCVU  NVARCHAR(50)    NOT NULL
                            CONSTRAINT CHK_NHANVIEN_CHUCVU
                            CHECK (CHUCVU IN (N'Quản lý', N'Pha chế')),
    MATKHAU VARCHAR(50)     NOT NULL,
    MACN    VARCHAR(10)     NOT NULL,
    FOREIGN KEY (MACN) REFERENCES CHINHANH(MACN)
);

-- [5] BẢNG MÓN ĂN
CREATE TABLE MONAN (
    MAMON   VARCHAR(10)     PRIMARY KEY,
    TENMON  NVARCHAR(100)   NOT NULL,
    DONGIA  INT             DEFAULT 0,
    MALOAI  INT,
    FOREIGN KEY (MALOAI) REFERENCES LOAI_MON(MALOAI)
);

-- =============================================
-- TẦNG 3: CÁC BẢNG CÓ KHÓA NGOẠI BẬC 2
-- =============================================

-- [6] BẢNG CA LÀM VIỆC
--     Mỗi lần nhân viên (Pha chế) đăng nhập hệ thống tự tạo 1 bản ghi ca.
--     Ca được đóng khi nhân viên nộp báo cáo (GIORA được cập nhật).
CREATE TABLE CALAMVIEC (
    MACA        INT         IDENTITY(1,1) PRIMARY KEY,
    MANV        VARCHAR(10) NOT NULL,
    GIOVAO      DATETIME    DEFAULT GETDATE(),
    GIORA       DATETIME    NULL,           -- NULL = ca đang mở
    TONGDOANHTHU INT        DEFAULT 0,
    FOREIGN KEY (MANV) REFERENCES NHANVIEN(MANV)
);

-- [7] BẢNG GIỎ HÀNG TẠM
--     Lưu trữ tạm thời các món khách đang chọn, bị xóa sau khi thanh toán.
CREATE TABLE GIOHANG_TAM (
    MAKH    INT             NOT NULL,
    MAMON   VARCHAR(10)     NOT NULL,
    SOLUONG INT             NOT NULL,
    PRIMARY KEY (MAKH, MAMON),
    FOREIGN KEY (MAKH)  REFERENCES KHACHHANG(MAKH),
    FOREIGN KEY (MAMON) REFERENCES MONAN(MAMON)
);

-- [8] BẢNG HÓA ĐƠN
--     LOAIDON: N'Mang đi' hoặc N'Giao hàng'
--     TRANGTHAI: N'Đang chuẩn bị' hoặc N'Hoàn thành'
--     MAKH có thể NULL nếu nhân viên tự tạo đơn tại quầy
CREATE TABLE HOADON (
    MAHD        INT             IDENTITY(1,1) PRIMARY KEY,
    NGAYLAP     DATETIME        DEFAULT GETDATE(),
    TONGTIEN    INT             DEFAULT 0,
    TRANGTHAI   NVARCHAR(50)    DEFAULT N'Đang chuẩn bị'
                                CONSTRAINT CHK_HOADON_TRANGTHAI
                                CHECK (TRANGTHAI IN (N'Đang chuẩn bị', N'Hoàn thành')),
    PHUONGTHUC  NVARCHAR(50),
    LOAIDON     NVARCHAR(50)    NOT NULL
                                CONSTRAINT CHK_HOADON_LOAIDON
                                CHECK (LOAIDON IN (N'Mang đi', N'Giao hàng')),
    DIACHIGIAO  NVARCHAR(255)   NULL,
    MACN        VARCHAR(10)     NOT NULL,
    MAKH        INT             NULL,
    MACA        INT             NULL,
    FOREIGN KEY (MACN) REFERENCES CHINHANH(MACN),
    FOREIGN KEY (MAKH) REFERENCES KHACHHANG(MAKH),
    FOREIGN KEY (MACA) REFERENCES CALAMVIEC(MACA)
);

-- [9] BẢNG CHI TIẾT HÓA ĐƠN
CREATE TABLE CHITIETHOADON (
    MAHD        INT             NOT NULL,
    MAMON       VARCHAR(10)     NOT NULL,
    SOLUONG     INT             NOT NULL,
    THANHTIEN   INT             NOT NULL,
    PRIMARY KEY (MAHD, MAMON),
    FOREIGN KEY (MAHD)  REFERENCES HOADON(MAHD),
    FOREIGN KEY (MAMON) REFERENCES MONAN(MAMON)
);

-- =============================================
-- TẦNG 4: CÁC BẢNG MODULE MỞ RỘNG
-- =============================================

-- [10] BẢNG ĐÁNH GIÁ
--      Mỗi hóa đơn chỉ được đánh giá 1 lần (MAHD là PK).
--      Khách hàng chỉ đánh giá được đơn có TRANGTHAI = N'Hoàn thành'.
CREATE TABLE DANHGIA (
    MAHD            INT             PRIMARY KEY,
    MAKH            INT             NOT NULL,
    MACN            VARCHAR(10)     NOT NULL,
    SOSAO           INT             NOT NULL
                                    CONSTRAINT CHK_DANHGIA_SOSAO
                                    CHECK (SOSAO >= 1 AND SOSAO <= 5),
    NOIDUNG         NVARCHAR(MAX)   NULL,
    HINHANH         NVARCHAR(MAX)   NULL,   -- Lưu URL hoặc base64
    PHANHOI_CUA_QUAN NVARCHAR(MAX)  NULL,
    NGAYTAO         DATETIME        DEFAULT GETDATE(),
    FOREIGN KEY (MAHD) REFERENCES HOADON(MAHD),
    FOREIGN KEY (MAKH) REFERENCES KHACHHANG(MAKH),
    FOREIGN KEY (MACN) REFERENCES CHINHANH(MACN)
);

-- [11] BẢNG THÔNG BÁO
--      Thiết kế tách biệt người nhận: MAKH dành cho khách hàng,
--      MANV dành cho nhân viên và quản lý.
--      Ràng buộc: Bắt buộc có đúng 1 trong 2 (không trống cả hai, không có cả hai).
--      ROLE: 'CUSTOMER' | 'STAFF' | 'ADMIN'
CREATE TABLE THONGBAO (
    MATB            INT             IDENTITY(1,1) PRIMARY KEY,
    MAKH            INT             NULL,       -- Dành cho CUSTOMER
    MANV            VARCHAR(10)     NULL,       -- Dành cho STAFF và ADMIN
    ROLE            VARCHAR(20)     NOT NULL
                                    CONSTRAINT CHK_THONGBAO_ROLE
                                    CHECK (ROLE IN ('CUSTOMER', 'STAFF', 'ADMIN')),
    NOIDUNG         NVARCHAR(255)   NOT NULL,
    TRANGTHAI_DOC   BIT             DEFAULT 0,  -- 0: Chưa đọc | 1: Đã đọc
    NGAYTAO         DATETIME        DEFAULT GETDATE(),

    -- Đảm bảo đúng 1 người nhận: hoặc là khách, hoặc là nhân viên
    CONSTRAINT CHK_THONGBAO_NGUOINHAN CHECK (
        (MAKH IS NOT NULL AND MANV IS NULL) OR
        (MAKH IS NULL     AND MANV IS NOT NULL)
    ),

    FOREIGN KEY (MAKH) REFERENCES KHACHHANG(MAKH),
    FOREIGN KEY (MANV) REFERENCES NHANVIEN(MANV)
);

-- =============================================
-- INDEX — TỐI ƯU TỐC ĐỘ TRUY VẤN
-- =============================================
CREATE INDEX IDX_HOADON_MAKH        ON HOADON(MAKH);
CREATE INDEX IDX_HOADON_MACA        ON HOADON(MACA);
CREATE INDEX IDX_HOADON_MACN        ON HOADON(MACN);
CREATE INDEX IDX_HOADON_TRANGTHAI   ON HOADON(TRANGTHAI);
CREATE INDEX IDX_CALAMVIEC_MANV     ON CALAMVIEC(MANV);
CREATE INDEX IDX_THONGBAO_MAKH      ON THONGBAO(MAKH, ROLE);
CREATE INDEX IDX_THONGBAO_MANV      ON THONGBAO(MANV, ROLE);

-- =============================================
-- DỮ LIỆU MẪU ĐỂ TEST HỆ THỐNG
-- =============================================

-- Chi Nhánh
INSERT INTO CHINHANH (MACN, TENCN, DIACHI, SDT) VALUES
('CN01', N'Neko Center Quận 1',  N'120 Lê Lợi, Q1, TP.HCM',    '0901234567'),
('CN02', N'Neko Hàm Nghi',       N'45 Hàm Nghi, Q1, TP.HCM',   '0907654321');

-- Nhân Viên
--   AD01: Quản lý (role ADMIN trong app)
--   NV01, NV02: Pha chế (role STAFF trong app)
INSERT INTO NHANVIEN (MANV, TENNV, CHUCVU, MATKHAU, MACN) VALUES
('AD01', N'Nguyễn Tuấn Thành',   N'Quản lý',  'admin123', 'CN01'),
('NV01', N'Trần Văn A',           N'Pha chế',  '123456',   'CN01'),
('NV02', N'Lê Thị B',             N'Pha chế',  '123456',   'CN02');

-- Loại Món
INSERT INTO LOAI_MON (TENLOAI) VALUES
(N'Cà phê'),
(N'Matcha'),
(N'Cold Brew'),
(N'Bánh');

-- Món Ăn
INSERT INTO MONAN (MAMON, TENMON, DONGIA, MALOAI) VALUES
('CF01', N'Cà Phê Muối Neko',     35000, 1),
('CF02', N'Bạc Xỉu Sài Gòn',      30000, 1),
('MT01', N'Freeze Matcha Cookie',  45000, 2),
('CB01', N'Cold Brew Cam Sả',      40000, 3),
('BA01', N'Bánh Sừng Trâu',        25000, 4);

-- Khách Hàng Demo
INSERT INTO KHACHHANG (TENKH, SDT, DIEMTICHLUY, TAIKHOAN, MATKHAU) VALUES
(N'Khách Test', '0988888888', 100, 'khach01', '123456');