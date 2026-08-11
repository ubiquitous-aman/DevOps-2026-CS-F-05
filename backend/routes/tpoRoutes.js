const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/tpoController');

router.use(protect, authorize('tpo'));

router.get('/companies', ctrl.getCompanies);
router.put('/companies/:id/approve', ctrl.decideCompanyRequirement);

router.get('/drives', ctrl.getAllDrives);
router.post('/drives', ctrl.createDrive);
router.put('/drives/:id', ctrl.updateDrive);
router.put('/drives/:id/publish', ctrl.publishDrive);
router.get('/drives/:id/eligible-students', ctrl.getEligibleStudents);
router.get('/drives/:id/applicants', ctrl.getApplicants);

router.put('/applications/:id/round', ctrl.updateRoundStatus);
router.put('/applications/:id/decision', ctrl.finalDecision);

router.get('/statistics', ctrl.getStatistics);
router.post('/notify', ctrl.notifyStudents);
router.get('/students', ctrl.getAllStudents);

module.exports = router;
