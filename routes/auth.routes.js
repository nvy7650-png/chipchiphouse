const express = require('express');
const router = express.Router();

const db = require('../db');

// ======================================================
// ĐĂNG KÝ
// POST /api/auth/register
// ======================================================
router.post('/register', async (req, res) => {
  try {
    const {
      username,
      email,
      phone,
      password
    } = req.body;

    // -----------------------------
    // Kiểm tra dữ liệu
    // -----------------------------
    if (!username || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ tất cả thông tin!'
      });
    }

    // -----------------------------
    // Validate username
    // -----------------------------
    if (username.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Tên tài khoản phải có ít nhất 3 ký tự!'
      });
    }

    // -----------------------------
    // Validate email
    // -----------------------------
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Email không hợp lệ!'
      });
    }

    // -----------------------------
    // Validate phone
    // -----------------------------
    const phoneRegex = /^0[0-9]{9}$/;

    if (!phoneRegex.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0!'
      });
    }

    // -----------------------------
    // Validate password
    // -----------------------------
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có ít nhất 6 ký tự!'
      });
    }

    // Chuẩn hóa dữ liệu
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    // ==================================================
    // KIỂM TRA USER ĐÃ TỒN TẠI
    // ==================================================

    const [existingUsers] = await db.query(
      `
      SELECT id, name, email, phone
      FROM users
      WHERE name = ?
         OR email = ?
         OR phone = ?
      LIMIT 1
      `,
      [
        cleanUsername,
        cleanEmail,
        cleanPhone
      ]
    );

    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];

      if (existingUser.name === cleanUsername) {
        return res.status(400).json({
          success: false,
          message: 'Tên tài khoản này đã tồn tại!'
        });
      }

      if (
        existingUser.email &&
        existingUser.email.toLowerCase() === cleanEmail
      ) {
        return res.status(400).json({
          success: false,
          message: 'Email này đã được đăng ký!'
        });
      }

      if (existingUser.phone === cleanPhone) {
        return res.status(400).json({
          success: false,
          message: 'Số điện thoại này đã được đăng ký!'
        });
      }
    }

    // ==================================================
    // TẠO USER
    // ==================================================

    const [result] = await db.query(
      `
      INSERT INTO users
      (
        name,
        email,
        phone,
        password,
        role
      )
      VALUES
      (?, ?, ?, ?, 'user')
      `,
      [
        cleanUsername,
        cleanEmail,
        cleanPhone,
        password
      ]
    );

    // ==================================================
    // LẤY USER VỪA TẠO
    // ==================================================

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        email,
        phone,
        role,
        created_at
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    if (rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Tạo tài khoản thất bại!'
      });
    }

    const user = rows[0];

    // ==================================================
    // TRẢ RESPONSE
    // ==================================================

    return res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công!',
      user
    });

  } catch (error) {
    console.error('❌ Lỗi đăng ký:', error);

    // Trường hợp email bị UNIQUE
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Email này đã được đăng ký!'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi đăng ký tài khoản!'
    });
  }
});


// ======================================================
// ĐĂNG NHẬP
// POST /api/auth/login
// ======================================================
router.post('/login', async (req, res) => {
  try {
    const {
      account,
      password
    } = req.body;

    // -----------------------------
    // Kiểm tra dữ liệu
    // -----------------------------
    if (!account || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập tài khoản và mật khẩu!'
      });
    }

    const cleanAccount = account.trim();

    // ==================================================
    // TÌM USER
    //
    // account có thể là:
    // - name
    // - email
    // - phone
    // ==================================================

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        email,
        phone,
        password,
        role,
        created_at
      FROM users
      WHERE name = ?
         OR email = ?
         OR phone = ?
      LIMIT 1
      `,
      [
        cleanAccount,
        cleanAccount.toLowerCase(),
        cleanAccount
      ]
    );

    // -----------------------------
    // Không tìm thấy
    // -----------------------------
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tài khoản không tồn tại trong hệ thống!'
      });
    }

    const user = rows[0];

    // ==================================================
    // KIỂM TRA PASSWORD
    // ==================================================

    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu không chính xác!'
      });
    }

    // ==================================================
    // CHUẨN HÓA ROLE
    // ==================================================

    const role = user.role
      ? String(user.role).trim().toLowerCase()
      : 'user';

    // ==================================================
    // USER DATA TRẢ VỀ FRONTEND
    // KHÔNG TRẢ PASSWORD
    // ==================================================

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: role,
      created_at: user.created_at
    };

    console.log(
      `✅ Login: ${user.email} | role: ${role}`
    );

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công!',
      user: userData
    });

  } catch (error) {
    console.error('❌ Lỗi đăng nhập:', error);

    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi đăng nhập!'
    });
  }
});


module.exports = router;