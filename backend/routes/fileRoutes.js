const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { wrapController, validateIdParam } = require('../middleware/common');
const ctrl = wrapController(require('../controllers/fileController'));

router.use(protect);
router.param('id', validateIdParam);

router.get('/resume/:id', ctrl.getResume);

module.exports = router;
