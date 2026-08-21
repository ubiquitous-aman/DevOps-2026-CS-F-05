const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/companyController');

router.use(protect, authorize('company'));

router.get('/profile', ctrl.getProfile);
router.put('/profile', ctrl.updateProfile);

router.post('/requirements', ctrl.submitRequirement);
router.get('/requirements', ctrl.getMyRequirements);

router.get('/drives/approved', ctrl.getApprovedDrives);
router.get('/drives/:id/applicants', ctrl.getApplicants);
router.get('/drives/:id/selected', ctrl.getSelectedCandidates);

router.get('/applications/:id', ctrl.getApplicationById);
router.put('/applications/:id/feedback', ctrl.updateFeedback);

router.post('/message-tpo', ctrl.messageTPO);

module.exports = router;
