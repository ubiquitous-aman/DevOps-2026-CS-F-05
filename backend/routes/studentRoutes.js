const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { wrapController, validateIdParam } = require('../middleware/common');
const upload = require('../middleware/upload');
const ctrl = wrapController(require('../controllers/studentController'));

router.use(protect, authorize('student'));
router.param('id', validateIdParam);

router.get('/profile', ctrl.getProfile);
router.put('/profile', ctrl.updateProfile);
router.post('/resume', upload.single('resume'), ctrl.uploadResume);

router.get('/drives', ctrl.getDrives);
router.get('/drives/:id/eligibility', ctrl.checkEligibility);
router.post('/drives/:id/apply', ctrl.applyToDrive);

router.get('/applications', ctrl.getMyApplications);
router.put('/applications/:id/withdraw', ctrl.withdrawApplication);

router.get('/results', ctrl.getResults);
router.get('/calendar', ctrl.getCalendar);

router.get('/notifications', ctrl.getNotifications);
router.put('/notifications/:id/read', ctrl.markNotificationRead);

module.exports = router;
