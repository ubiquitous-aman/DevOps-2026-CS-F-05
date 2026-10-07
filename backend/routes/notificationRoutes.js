const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { wrapController, validateIdParam } = require('../middleware/common');
const ctrl = wrapController(require('../controllers/notificationController'));

router.use(protect);
router.param('id', validateIdParam);

router.get('/', ctrl.list);
router.put('/read-all', ctrl.readAll);
router.put('/:id/read', ctrl.readOne);

module.exports = router;
