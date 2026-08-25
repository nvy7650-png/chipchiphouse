const express = require('express');
const cors = require('cors');

const app = express();

// Middleware giải mã JSON từ Request Body & cho phép Frontend gọi API (CORS)
app.use(cors());
app.use(express.json());

// Khai báo Route Auth
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});