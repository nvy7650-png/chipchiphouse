const express = require('express');
const router = express.Router();

// TẠO MẢNG LƯU DỮ LIỆU TẠM THỜI (Không cần Model DB)
const users = [];

// ==========================================
// 1. ROUTE ĐĂNG KÝ (POST /api/auth/register)
// ==========================================
router.post('/register', (req, res) => {
  const { username, email, phone, password } = req.body;

  // Validate các trường bắt buộc
  if (!username || !email || !phone || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Vui lòng điền đầy đủ tất cả các thông tin!' 
    });
  }

  // Validate Email chuẩn định dạng Regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Định dạng Email không hợp lệ!' 
    });
  }

  // Validate Số điện thoại (Đúng 10 chữ số, bắt đầu bằng số 0)
  const phoneRegex = /^0[0-9]{9}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Số điện thoại không hợp lệ! Phải bao gồm đúng 10 chữ số và bắt đầu bằng số 0.' 
    });
  }

  // Kiểm tra độ dài mật khẩu
  if (password.length < 6) {
    return res.status(400).json({ 
      success: false, 
      message: 'Mật khẩu phải có độ dài ít nhất 6 ký tự!' 
    });
  }

  // Kiểm tra trùng lặp Email hoặc Số điện thoại hoặc Username
  const existingUser = users.find(
    (u) => u.email === email || u.phone === phone || u.username === username
  );

  if (existingUser) {
    if (existingUser.username === username) {
      return res.status(400).json({ success: false, message: 'Tên tài khoản này đã tồn tại!' });
    }
    if (existingUser.email === email) {
      return res.status(400).json({ success: false, message: 'Email này đã được đăng ký!' });
    }
    if (existingUser.phone === phone) {
      return res.status(400).json({ success: false, message: 'Số điện thoại này đã được đăng ký!' });
    }
  }

  // Khởi tạo User mới
  const newUser = {
    id: users.length + 1,
    username,
    email,
    phone,
    password, // Trong thực tế nên dùng bcrypt để hash, ở đây lưu thẳng chuỗi
    createdAt: new Date()
  };

  // Lưu vào mảng
  users.push(newUser);

  // Phản hồi thành công (Ẩn mật khẩu khi trả về)
  const { password: _, ...userData } = newUser;
  return res.status(201).json({
    success: true,
    message: 'Đăng ký tài khoản thành công! 🎉',
    user: userData
  });
});

// ==========================================
// 2. ROUTE ĐĂNG NHẬP (POST /api/auth/login)
// ==========================================
router.post('/login', (req, res) => {
  const { account, password } = req.body; // account có thể là email, số điện thoại hoặc username

  if (!account || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Vui lòng nhập tài khoản và mật khẩu!' 
    });
  }

  // Tìm user theo Email, SĐT hoặc Username
  const user = users.find(
    (u) => u.email === account || u.phone === account || u.username === account
  );

  if (!user) {
    return res.status(404).json({ 
      success: false, 
      message: 'Tài khoản không tồn tại trong hệ thống!' 
    });
  }

  // Kiểm tra mật khẩu
  if (user.password !== password) {
    return res.status(401).json({ 
      success: false, 
      message: 'Mật khẩu không chính xác!' 
    });
  }

  // Phản hồi đăng nhập thành công
  const { password: _, ...userData } = user;
  return res.status(200).json({
    success: true,
    message: 'Đăng nhập thành công! Welcome back.',
    user: userData
  });
});

module.exports = router;