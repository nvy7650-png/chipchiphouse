const express = require('express');
const router = express.Router();
const db = require('../db');

// ==========================================
// GET ADMIN DASHBOARD STATISTICS
// ==========================================
router.get('/stats', async (req, res) => {
  try {

    // ==============================
    // TỔNG SỐ KHÁCH HÀNG
    // Chỉ tính role = 'user'
    // ==============================
    const [usersResult] = await db.query(`
      SELECT COUNT(*) AS totalUsers
      FROM users
      WHERE role = 'user'
    `);

    // ==============================
    // TỔNG SỐ SẢN PHẨM
    // ==============================
    const [productsResult] = await db.query(`
      SELECT COUNT(*) AS totalProducts
      FROM products
    `);

    // ==============================
    // TỔNG SỐ ĐƠN HÀNG
    // ==============================
    const [ordersResult] = await db.query(`
      SELECT COUNT(*) AS totalOrders
      FROM orders
    `);

    // ==============================
    // TỔNG DOANH THU
    // Chỉ tính đơn completed
    // ==============================
    const [revenueResult] = await db.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS totalRevenue
      FROM orders
      WHERE status = 'completed'
    `);

    // ==============================
    // 5 ĐƠN HÀNG GẦN NHẤT
    // ==============================
    const [recentOrders] = await db.query(`
      SELECT
        o.id,
        o.total_amount,
        o.status,
        o.created_at,
        u.name AS customer
      FROM orders o
      LEFT JOIN users u
        ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    // ==============================
    // RESPONSE
    // ==============================
    res.json({
      success: true,

      stats: {
        totalRevenue: Number(
          revenueResult[0]?.totalRevenue || 0
        ),

        totalOrders: Number(
          ordersResult[0]?.totalOrders || 0
        ),

        totalProducts: Number(
          productsResult[0]?.totalProducts || 0
        ),

        // Chỉ trả về số khách hàng role = user
        totalUsers: Number(
          usersResult[0]?.totalUsers || 0
        )
      },

      recentOrders
    });

  } catch (error) {

    console.error(
      'Lỗi lấy thống kê admin:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Không thể lấy dữ liệu dashboard'
    });
  }
});

module.exports = router;