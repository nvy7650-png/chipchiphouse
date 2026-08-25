const express = require('express');
const router = express.Router();

const db = require('../db');

// ==========================================
// 1. ĐĂNG KÝ
// POST /api/auth/register
// ==========================================
router.post('/register', async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    // Kiểm tra dữ liệu bắt buộc
    if (!username || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ tất cả các thông tin!'
      });
    }

    // Kiểm tra email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Định dạng Email không hợp lệ!'
      });
    }

    // Kiểm tra số điện thoại
    const phoneRegex = /^0[0-9]{9}$/;

    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message:
          'Số điện thoại không hợp lệ! Phải gồm đúng 10 chữ số và bắt đầu bằng số 0.'
      });
    }

    // Kiểm tra mật khẩu
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có ít nhất 6 ký tự!'
      });
    }

    // ==========================================
    // KIỂM TRA USER ĐÃ TỒN TẠI CHƯA
    // ==========================================
    const [existingUsers] = await db.query(
      `
      SELECT id, name, email, phone
      FROM users
      WHERE name = ?
         OR email = ?
         OR phone = ?
      LIMIT 1
      `,
      [username, email, phone]
    );

    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];

      if (existingUser.name === username) {
        return res.status(400).json({
          success: false,
          message: 'Tên tài khoản này đã tồn tại!'
        });
      }

      if (existingUser.email === email) {
        return res.status(400).json({
          success: false,
          message: 'Email này đã được đăng ký!'
        });
      }

      if (existingUser.phone === phone) {
        return res.status(400).json({
          success: false,
          message: 'Số điện thoại này đã được đăng ký!'
        });
      }
    }

    // ==========================================
    // THÊM USER VÀO TIDB
    // ==========================================
    const [result] = await db.query(
      `
      INSERT INTO users
        (name, email, phone, password, role)
      VALUES
        (?, ?, ?, ?, 'user')
      `,
      [username, email, phone, password]
    );

    // Lấy user vừa tạo
    const [rows] = await db.query(
      `
      SELECT id, name, email, phone, role, created_at
      FROM users
      WHERE id = ?
      `,
      [result.insertId]
    );

    const user = rows[0];

    // Trả về thông tin user
    // Frontend sẽ lưu localStorage rồi chuyển về Home
    return res.status(201).json({
      success: true,
      user: user
    });

  } catch (error) {
    console.error('Lỗi đăng ký:', error);

    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi đăng ký tài khoản!'
    });
  }
});


// ==========================================
// 2. ĐĂNG NHẬP
// POST /api/auth/login
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { account, password } = req.body;

    if (!account || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập tài khoản và mật khẩu!'
      });
    }

    // Tìm theo:
    // - username (cột name)
    // - email
    // - số điện thoại
    const [rows] = await db.query(
      `
      SELECT id, name, email, phone, password, role, created_at
      FROM users
      WHERE name = ?
         OR email = ?
         OR phone = ?
      LIMIT 1
      `,
      [account, account, account]
    );

    // Không tìm thấy tài khoản
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tài khoản không tồn tại trong hệ thống!'
      });
    }

    const user = rows[0];

    // Kiểm tra mật khẩu
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu không chính xác!'
      });
    }

    // Không trả password về frontend
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      created_at: user.created_at
    };

    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công!',
      user: userData
    });

  } catch (error) {
    console.error('Lỗi đăng nhập:', error);

    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi đăng nhập!'
    });
  }
});

module.exports = router;