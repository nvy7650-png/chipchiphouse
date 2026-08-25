const express = require('express');
const router = express.Router();
const db = require('../db');

// ==========================================
// GET ADMIN DASHBOARD STATISTICS
// GET /api/admin/stats?month=8&year=2026
// ==========================================
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();

    const month = Number(req.query.month) || (now.getMonth() + 1);
    const year = Number(req.query.year) || now.getFullYear();

    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'Tháng không hợp lệ!'
      });
    }

    // ==========================================
    // 1. TỔNG KHÁCH HÀNG
    // Chỉ tính role = user
    // ==========================================
    const [usersResult] = await db.query(`
      SELECT COUNT(*) AS totalUsers
      FROM users
      WHERE role = 'user'
    `);

    // ==========================================
    // 2. TỔNG SẢN PHẨM
    // ==========================================
    const [productsResult] = await db.query(`
      SELECT COUNT(*) AS totalProducts
      FROM products
    `);

    // ==========================================
    // 3. ĐƠN HÀNG TRONG THÁNG
    // ==========================================
    const [ordersResult] = await db.query(`
      SELECT COUNT(*) AS totalOrders
      FROM orders
      WHERE MONTH(created_at) = ?
        AND YEAR(created_at) = ?
    `, [month, year]);

    // ==========================================
    // 4. DOANH THU TRONG THÁNG
    // Chỉ tính đơn completed
    // ==========================================
    const [revenueResult] = await db.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS totalRevenue
      FROM orders
      WHERE status = 'completed'
        AND MONTH(created_at) = ?
        AND YEAR(created_at) = ?
    `, [month, year]);

    // ==========================================
    // 5. KHÁCH HÀNG MỚI TRONG THÁNG
    // ==========================================
    const [newUsersResult] = await db.query(`
      SELECT COUNT(*) AS newUsers
      FROM users
      WHERE role = 'user'
        AND MONTH(created_at) = ?
        AND YEAR(created_at) = ?
    `, [month, year]);

    // ==========================================
    // 6. ĐƠN HÀNG GẦN NHẤT
    // ==========================================
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

    // ==========================================
    // 7. DOANH THU 12 THÁNG
    // ==========================================
    const [monthlyRevenue] = await db.query(`
      SELECT
        MONTH(created_at) AS month,
        COALESCE(SUM(total_amount), 0) AS revenue
      FROM orders
      WHERE status = 'completed'
        AND YEAR(created_at) = ?
      GROUP BY MONTH(created_at)
      ORDER BY MONTH(created_at)
    `, [year]);

    // ==========================================
    // 8. ĐƠN HÀNG 12 THÁNG
    // ==========================================
    const [monthlyOrders] = await db.query(`
      SELECT
        MONTH(created_at) AS month,
        COUNT(*) AS orders
      FROM orders
      WHERE YEAR(created_at) = ?
      GROUP BY MONTH(created_at)
      ORDER BY MONTH(created_at)
    `, [year]);

    // ==========================================
    // RESPONSE
    // ==========================================
    res.json({
      success: true,

      selectedPeriod: {
        month,
        year
      },

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

        totalUsers: Number(
          usersResult[0]?.totalUsers || 0
        ),

        newUsers: Number(
          newUsersResult[0]?.newUsers || 0
        )
      },

      monthlyRevenue,

      monthlyOrders,

      recentOrders
    });

  } catch (error) {
    console.error('Lỗi lấy thống kê admin:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể lấy dữ liệu dashboard'
    });
  }
});

module.exports = router;