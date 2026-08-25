const express = require('express');

const router = express.Router();

// Kết nối TiDB
const db = require('../db');


// ==========================================
// 1. ĐĂNG KÝ
// POST /api/auth/register
// ==========================================

router.post('/register', (req, res) => {

  const {
    username,
    email,
    phone,
    password
  } = req.body;


  // ==========================================
  // VALIDATE
  // ==========================================

  if (!username || !email || !phone || !password) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng điền đầy đủ tất cả các thông tin!'
    });
  }


  // Validate Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Định dạng Email không hợp lệ!'
    });
  }


  // Validate số điện thoại
  const phoneRegex = /^0[0-9]{9}$/;

  if (!phoneRegex.test(phone)) {
    return res.status(400).json({
      success: false,
      message:
        'Số điện thoại không hợp lệ! Phải bao gồm đúng 10 chữ số và bắt đầu bằng số 0.'
    });
  }


  // Validate mật khẩu
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Mật khẩu phải có độ dài ít nhất 6 ký tự!'
    });
  }


  // ==========================================
  // KIỂM TRA TRÙNG EMAIL / TÊN / PHONE
  // ==========================================

  const checkSql = `
    SELECT id, name, email, phone
    FROM users
    WHERE name = ?
       OR email = ?
       OR phone = ?
    LIMIT 1
  `;


  db.query(
    checkSql,
    [username, email, phone],
    (err, results) => {

      if (err) {
        console.error('Lỗi kiểm tra user:', err);

        return res.status(500).json({
          success: false,
          message: 'Lỗi kết nối cơ sở dữ liệu!'
        });
      }


      // Có tài khoản trùng
      if (results.length > 0) {

        const existingUser = results[0];


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


        if (
          existingUser.phone &&
          existingUser.phone === phone
        ) {
          return res.status(400).json({
            success: false,
            message: 'Số điện thoại này đã được đăng ký!'
          });
        }
      }


      // ==========================================
      // INSERT USER
      // role mặc định là user
      // created_at tự động
      // ==========================================

      const insertSql = `
        INSERT INTO users
        (
          name,
          email,
          phone,
          password,
          role
        )
        VALUES (?, ?, ?, ?, 'user')
      `;


      db.query(
        insertSql,
        [
          username,
          email,
          phone,
          password
        ],
        (err, result) => {

          if (err) {
            console.error('Lỗi tạo user:', err);

            return res.status(500).json({
              success: false,
              message: 'Không thể tạo tài khoản!'
            });
          }


          // ==========================================
          // LẤY USER VỪA TẠO
          // ==========================================

          const getUserSql = `
            SELECT
              id,
              name,
              email,
              phone,
              role,
              created_at
            FROM users
            WHERE id = ?
          `;


          db.query(
            getUserSql,
            [result.insertId],
            (err, userResults) => {

              if (err) {
                console.error('Lỗi lấy user:', err);

                return res.status(500).json({
                  success: false,
                  message:
                    'Tài khoản đã tạo nhưng không thể lấy thông tin!'
                });
              }


              return res.status(201).json({
                success: true,
                message: 'Đăng ký tài khoản thành công!',
                user: userResults[0]
              });

            }
          );

        }
      );

    }
  );

});


// ==========================================
// 2. ĐĂNG NHẬP
// POST /api/auth/login
// ==========================================

router.post('/login', (req, res) => {

  // Frontend có thể gửi email
  // hoặc account
  const {
    email,
    account,
    password
  } = req.body;


  const loginAccount = email || account;


  // ==========================================
  // VALIDATE
  // ==========================================

  if (!loginAccount || !password) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập tài khoản và mật khẩu!'
    });
  }


  // ==========================================
  // TÌM USER
  // email / name / phone
  // ==========================================

  const loginSql = `
    SELECT
      id,
      name,
      email,
      phone,
      password,
      role,
      created_at
    FROM users
    WHERE email = ?
       OR name = ?
       OR phone = ?
    LIMIT 1
  `;


  db.query(
    loginSql,
    [
      loginAccount,
      loginAccount,
      loginAccount
    ],
    (err, results) => {

      if (err) {
        console.error('Lỗi đăng nhập:', err);

        return res.status(500).json({
          success: false,
          message: 'Lỗi kết nối cơ sở dữ liệu!'
        });
      }


      // Không tìm thấy tài khoản
      if (results.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Tài khoản không tồn tại trong hệ thống!'
        });
      }


      const user = results[0];


      // ==========================================
      // KIỂM TRA PASSWORD
      // ==========================================

      if (user.password !== password) {
        return res.status(401).json({
          success: false,
          message: 'Mật khẩu không chính xác!'
        });
      }


      // ==========================================
      // KHÔNG TRẢ PASSWORD
      // ==========================================

      const {
        password: _,
        ...userData
      } = user;


      return res.status(200).json({
        success: true,
        message: 'Đăng nhập thành công!',
        user: userData
      });

    }
  );

});


module.exports = router;