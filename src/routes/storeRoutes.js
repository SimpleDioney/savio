const express = require("express");
const router = express.Router();
const storeController = require("../controllers/storeController");
const authenticateToken = require("../middleware/auth");

// Rotas de lojas
router.get('/stores', authenticateToken, storeController.getStores.bind(storeController));
router.post('/stores', authenticateToken, storeController.createStore.bind(storeController));
router.put('/stores/:id', authenticateToken, storeController.updateStore.bind(storeController));
router.delete('/stores/:id', authenticateToken, storeController.deleteStore.bind(storeController));

module.exports = router;