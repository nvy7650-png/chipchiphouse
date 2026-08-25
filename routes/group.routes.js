const express = require('express');
const router = express.Router();

const db = require('../db');

// ==========================================
// GET - LẤY TẤT CẢ NHÓM NHẠC
// GET /api/groups
// ==========================================

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        name
      FROM kpop_groups
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      groups: rows
    });

  } catch (error) {
    console.error('Lỗi lấy nhóm nhạc:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách nhóm nhạc!'
    });
  }
});


// ==========================================
// POST - THÊM NHÓM NHẠC
// POST /api/groups
// ==========================================

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên nhóm nhạc không được để trống!'
      });
    }

    const groupName = name.trim();

    // Kiểm tra trùng
    const [existing] = await db.query(
      `
      SELECT id
      FROM kpop_groups
      WHERE LOWER(name) = LOWER(?)
      LIMIT 1
      `,
      [groupName]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Nhóm nhạc này đã tồn tại!'
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO kpop_groups (name)
      VALUES (?)
      `,
      [groupName]
    );

    const [rows] = await db.query(
      `
      SELECT id, name
      FROM kpop_groups
      WHERE id = ?
      `,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Thêm nhóm nhạc thành công!',
      group: rows[0]
    });

  } catch (error) {
    console.error('Lỗi thêm nhóm nhạc:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể thêm nhóm nhạc!'
    });
  }
});


// ==========================================
// PUT - CẬP NHẬT NHÓM NHẠC
// PUT /api/groups/:id
// ==========================================

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên nhóm nhạc không được để trống!'
      });
    }

    const groupName = name.trim();

    // Kiểm tra nhóm có tồn tại
    const [existingGroup] = await db.query(
      `
      SELECT id
      FROM kpop_groups
      WHERE id = ?
      `,
      [id]
    );

    if (existingGroup.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm nhạc!'
      });
    }

    // Kiểm tra trùng tên với nhóm khác
    const [duplicate] = await db.query(
      `
      SELECT id
      FROM kpop_groups
      WHERE LOWER(name) = LOWER(?)
        AND id <> ?
      LIMIT 1
      `,
      [groupName, id]
    );

    if (duplicate.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tên nhóm nhạc này đã tồn tại!'
      });
    }

    await db.query(
      `
      UPDATE kpop_groups
      SET name = ?
      WHERE id = ?
      `,
      [groupName, id]
    );

    const [rows] = await db.query(
      `
      SELECT id, name
      FROM kpop_groups
      WHERE id = ?
      `,
      [id]
    );

    res.json({
      success: true,
      message: 'Cập nhật nhóm nhạc thành công!',
      group: rows[0]
    });

  } catch (error) {
    console.error('Lỗi cập nhật nhóm nhạc:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể cập nhật nhóm nhạc!'
    });
  }
});


// ==========================================
// DELETE - XÓA NHÓM NHẠC
// DELETE /api/groups/:id
// ==========================================

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra nhóm tồn tại
    const [existing] = await db.query(
      `
      SELECT id
      FROM kpop_groups
      WHERE id = ?
      `,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm nhạc!'
      });
    }

    // Kiểm tra nhóm có sản phẩm không
    const [products] = await db.query(
      `
      SELECT id
      FROM products
      WHERE group_id = ?
      LIMIT 1
      `,
      [id]
    );

    if (products.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          'Không thể xóa nhóm nhạc vì đang có sản phẩm thuộc nhóm này!'
      });
    }

    await db.query(
      `
      DELETE FROM kpop_groups
      WHERE id = ?
      `,
      [id]
    );

    res.json({
      success: true,
      message: 'Xóa nhóm nhạc thành công!'
    });

  } catch (error) {
    console.error('Lỗi xóa nhóm nhạc:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể xóa nhóm nhạc!'
    });
  }
});


module.exports = router;