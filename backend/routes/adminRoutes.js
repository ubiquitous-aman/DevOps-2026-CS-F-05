const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');

router.use(protect, authorize('admin'));

router.get('/users', ctrl.getUsers);
router.post('/users', ctrl.createUser);
router.put('/users/:id/role', ctrl.updateUserRole);
router.put('/users/:id/status', ctrl.toggleUserStatus);
router.delete('/users/:id', ctrl.deleteUser);

router.get('/system-info', ctrl.getSystemInfo);
router.get('/activity-logs', ctrl.getActivityLogs);

module.exports = router;
