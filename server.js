const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

const adminRoutes = require('./routes/admin.routes');
app.use('/api/admin', adminRoutes);

const groupRoutes = require('./routes/group.routes');
app.use('/api/groups', groupRoutes);

const albumRoutes = require('./routes/album.routes');
app.use('/api/albums', albumRoutes);

const productRoutes = require('./routes/product.routes');
app.use('/api/products', productRoutes);

const orderRoutes = require('./routes/order.routes');
app.use('/api/orders', orderRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
});