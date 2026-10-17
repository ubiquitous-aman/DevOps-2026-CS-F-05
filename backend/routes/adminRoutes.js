const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { wrapController, validateIdParam } = require('../middleware/common');
const ctrl = wrapController(require('../controllers/adminController'));
const tpo = wrapController(require('../controllers/tpoController'));

router.use(protect, authorize('admin'));
router.param('id', validateIdParam);

router.put('/users/bulk-status', ctrl.bulkStudentStatus); // must stay above /users/:id
router.get('/export/users', ctrl.exportUsers);
router.get('/users', ctrl.getUsers);
router.post('/users', ctrl.createUser);
router.put('/users/:id', ctrl.updateUser);
router.put('/users/:id/role', ctrl.updateUserRole);
router.put('/users/:id/status', ctrl.toggleUserStatus);
router.put('/users/:id/password', ctrl.resetUserPassword);
router.delete('/users/:id', ctrl.deleteUser);

router.get('/students/:id', tpo.getStudentDetails); // full student view

router.get('/system-info', ctrl.getSystemInfo);
router.get('/activity-logs', ctrl.getActivityLogs);

module.exports = router;
