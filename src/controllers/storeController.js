const database = require("../models/database");

class StoreController {
    async getStores(req, res) {
        try {
            const db = await database.getDb();
            const stores = await db.all(
                'SELECT * FROM stores WHERE active = 1 ORDER BY name'
            );
            res.json(stores);
        } catch (error) {
            
            res.status(500).json({ message: 'Erro ao buscar lojas' });
        }
    }

    async createStore(req, res) {
        try {
            const db = await database.getDb();
            // Verificar privilégios de admin
            if (!req.user.isAdmin) {
                return res.status(403).json({ message: 'Apenas administradores podem criar lojas' });
            }

            const { name, address, phone } = req.body;

            if (!name) {
                return res.status(400).json({ message: 'Nome da loja é obrigatório' });
            }

            const result = await db.run(
                'INSERT INTO stores (name, address, phone) VALUES (?, ?, ?)',
                [name, address, phone]
            );

            res.json({
                id: result.lastID,
                name,
                address,
                phone,
                message: 'Loja criada com sucesso'
            });
        } catch (error) {
            
            res.status(500).json({ message: 'Erro ao criar loja' });
        }
    }

    async updateStore(req, res) {
        try {
            const db = await database.getDb();
            if (!req.user.isAdmin) {
                return res.status(403).json({ message: 'Apenas administradores podem editar lojas' });
            }

            const { id } = req.params;
            const { name, address, phone, active } = req.body;

            await db.run(
                'UPDATE stores SET name = ?, address = ?, phone = ?, active = ? WHERE id = ?',
                [name, address, phone, active, id]
            );

            res.json({ message: 'Loja atualizada com sucesso' });
        } catch (error) {
            
            res.status(500).json({ message: 'Erro ao atualizar loja' });
        }
    }

    async deleteStore(req, res) {
        try {
            const storeId = req.params.id;

            const result = await database.withTransaction(async (db) => {
                // Verificar se a loja existe
                const store = await db.get('SELECT * FROM stores WHERE id = ?', [storeId]);
                if (!store) {
                    throw new Error('Loja não encontrada');
                }

                // Verificar se há funcionários na loja
                const employees = await db.all(
                    'SELECT id FROM employees WHERE store_id = ?',
                    [storeId]
                );

                // Atualizar funcionários para sem loja (null)
                if (employees.length > 0) {
                    await db.run(
                        'UPDATE employees SET store_id = NULL WHERE store_id = ?',
                        [storeId]
                    );
                }

                // Remover a loja
                await db.run(
                    'DELETE FROM stores WHERE id = ?',
                    [storeId]
                );

                return {
                    affectedEmployees: employees.length
                };
            });

            res.json({ 
                message: 'Loja removida com sucesso',
                affectedEmployees: result.affectedEmployees
            });
        } catch (error) {
            
            if (error.message === 'Loja não encontrada') {
                res.status(404).json({ message: error.message });
            } else {
                res.status(500).json({ message: 'Erro ao remover loja' });
            }
        }
    }
}

const storeController = new StoreController();
module.exports = storeController;