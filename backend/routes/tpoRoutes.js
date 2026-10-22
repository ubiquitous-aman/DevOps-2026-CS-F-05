const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { wrapController, validateIdParam } = require('../middleware/common');
const ctrl = wrapController(require('../controllers/tpoController'));

router.use(protect, authorize('tpo'));
router.param('id', validateIdParam);

router.get('/companies', ctrl.getCompanies);
router.put('/companies/:id/approve', ctrl.decideCompanyRequirement);

router.get('/drives', ctrl.getAllDrives);
router.post('/drives', ctrl.createDrive);
router.put('/drives/:id', ctrl.updateDrive);
router.put('/drives/:id/publish', ctrl.publishDrive);
router.put('/drives/:id/decision', ctrl.decideDrive);
router.put('/drives/:id/status', ctrl.setDriveStatus);
router.put('/drives/:id/schedule', ctrl.scheduleDrive);
router.get('/drives/:id/eligible-students', ctrl.getEligibleStudents);
router.get('/drives/:id/applicants', ctrl.getApplicants);

router.put('/applications/bulk-round', ctrl.bulkRoundStatus); // must stay above the :id routes
router.put('/applications/:id/round', ctrl.updateRoundStatus);
router.put('/applications/:id/decision', ctrl.finalDecision);

router.get('/statistics', ctrl.getStatistics);
router.post('/notify', ctrl.notifyStudents);
router.get('/students', ctrl.getAllStudents);
router.post('/students/bulk', ctrl.bulkImportStudents); // must stay above the :id routes
router.get('/students/:id', ctrl.getStudentDetails);

router.post('/message-company', ctrl.messageCompany);

router.get('/export/students', ctrl.exportStudents);
router.get('/drives/:id/export', ctrl.exportApplicants);
router.get('/drives/:id/export-eligible', ctrl.exportEligible);

module.exports = router;
