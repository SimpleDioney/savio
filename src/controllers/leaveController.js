const database = require("../models/database");

class LeaveController {
    async getLeaves(req, res) {
        try {
            const db = await database.getDb();
            const { month, year, employeeId } = req.query;
            let query = `
                SELECT l.*, e.name as employee_name 
                FROM leaves l
                JOIN employees e ON l.employee_id = e.id
                WHERE 1=1
            `;
            const params = [];

            if (month && year) {
                query += ` AND strftime('%Y-%m', l.date) = ?`;
                params.push(`${year}-${month.padStart(2, "0")}`);
            }

            if (employeeId) {
                query += ` AND l.employee_id = ?`;
                params.push(employeeId);
            }

            const leaves = await db.all(query, params);
            res.json(leaves);
        } catch (error) {
            
            res.status(500).json({ message: "Erro ao buscar folgas" });
        }
    }

    async createLeave(req, res) {
        try {
            const db = await database.getDb();
            const { employeeId, date } = req.body;

            const result = await db.run(
                "INSERT INTO leaves (employee_id, date) VALUES (?, ?)",
                [employeeId, date]
            );

            res.json({
                id: result.lastID,
                employeeId,
                date,
            });
        } catch (error) {
            
            res.status(500).json({ message: "Erro ao registrar folga" });
        }
    }

    async deleteLeave(req, res) {
        try {
            const db = await database.getDb();
            const { id } = req.params;

            // Verificar se a folga existe
            const leave = await db.get("SELECT * FROM leaves WHERE id = ?", [id]);
            if (!leave) {
                return res.status(404).json({ message: "Folga não encontrada" });
            }

            // Apenas admin pode remover folgas
            if (!req.user.isAdmin) {
                return res.status(403).json({ message: "Permissão negada" });
            }

            await db.run("DELETE FROM leaves WHERE id = ?", [id]);

            res.json({ message: "Folga removida com sucesso" });
        } catch (error) {
            
            res.status(500).json({ message: "Erro ao remover folga" });
        }
    }

    async getLeaveRequests(req, res) {
        try {
            const db = await database.getDb();
            const { month } = req.query;
            
            // Se não houver mês específico, usar mês atual
            let year, monthNum;
            if (!month) {
                const now = new Date();
                year = now.getFullYear();
                monthNum = String(now.getMonth() + 1).padStart(2, '0');
            } else {
                [year, monthNum] = month.split('-');
            }
            
            let query = `
                SELECT 
                    lr.id,
                    lr.employee_id,
                    lr.status,
                    lr.created_at,
                    lrd.date,
                    e.name as employee_name,
                    e.store_id,
                    s.name as store_name
                FROM leave_requests lr
                JOIN leave_request_dates lrd ON lr.id = lrd.request_id
                JOIN employees e ON lr.employee_id = e.id
                LEFT JOIN stores s ON e.store_id = s.id
                WHERE strftime('%Y-%m', lrd.date) = ?
                AND lr.status = 'pending'  
            `;
            
            const params = [`${year}-${monthNum}`];

            // Se não for admin, mostrar apenas as próprias solicitações
            if (!req.user.isAdmin) {
                query += ' AND lr.employee_id = ?';
                params.push(req.user.employeeId);
            }

            // Ordenar por data de criação
            query += ' ORDER BY lr.created_at DESC';

            const requests = await db.all(query, params);
            
            // Agrupar datas por solicitação
            const groupedRequests = requests.reduce((acc, curr) => {
                if (!acc[curr.id]) {
                    acc[curr.id] = {
                        id: curr.id,
                        employeeId: curr.employee_id,
                        employeeName: curr.employee_name,
                        status: curr.status,
                        createdAt: curr.created_at,
                        storeId: curr.store_id,
                        storeName: curr.store_name,
                        dates: []
                    };
                }
                acc[curr.id].dates.push(curr.date);
                return acc;
            }, {});

            res.json(Object.values(groupedRequests));
        } catch (error) {
            res.status(500).json({ message: 'Erro ao buscar solicitações' });
        }
    }

    async createLeaveRequest(req, res) {
        try {
            const { dates } = req.body;

            if (!dates || dates.length !== 2) {
                return res.status(400).json({ message: 'Selecione um sábado e domingo consecutivos' });
            }

            const db = await database.getDb();

            // Buscar a loja do funcionário que está fazendo a solicitação
            const employee = await db.get(
                'SELECT store_id FROM employees WHERE id = ?',
                [req.user.employeeId]
            );

            if (!employee.store_id) {
                return res.status(400).json({ message: 'Funcionário não está associado a uma loja' });
            }

            // Verificar se já existe solicitação para estas datas na mesma loja
            const existingRequests = await db.get(`
                SELECT COUNT(*) as count
                FROM leave_request_dates lrd
                JOIN leave_requests lr ON lrd.request_id = lr.id
                JOIN employees e ON lr.employee_id = e.id
                WHERE lrd.date IN (?, ?)
                AND e.store_id = ?
                AND lr.status = 'pending'`,
                [...dates, employee.store_id]
            );

            if (existingRequests.count > 0) {
                return res.status(400).json({ 
                    message: 'Já existe uma solicitação pendente para estas datas na sua loja' 
                });
            }

            const result = await database.withTransaction(async (db) => {
                // Criar a solicitação com status pending
                const requestResult = await db.run(
                    'INSERT INTO leave_requests (employee_id, status) VALUES (?, ?)',
                    [req.user.employeeId, 'pending']
                );

                // Inserir as datas
                for (const date of dates) {
                    await db.run(
                        'INSERT INTO leave_request_dates (request_id, date) VALUES (?, ?)',
                        [requestResult.lastID, date]
                    );
                }

                return { requestId: requestResult.lastID };
            });

            res.json({
                message: 'Solicitação criada com sucesso',
                requestId: result.requestId
            });
        } catch (error) {
            res.status(500).json({ message: 'Erro ao criar solicitação' });
        }
    }


    async processLeaveRequest(req, res) {
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Apenas administradores podem aprovar/rejeitar solicitações' });
        }

        try {
            const { id, action } = req.params;
            
            if (action !== 'approve' && action !== 'reject') {
                return res.status(400).json({ message: 'Ação inválida' });
            }

            const result = await database.withTransaction(async (db) => {
                // Obter a solicitação e suas datas
                const request = await db.get(
                    'SELECT employee_id FROM leave_requests WHERE id = ?',
                    [id]
                );

                const dates = await db.all(
                    'SELECT date FROM leave_request_dates WHERE request_id = ?',
                    [id]
                );

                if (action === 'approve') {
                    // Se aprovada, atualiza o status e insere as folgas
                    await db.run(
                        'UPDATE leave_requests SET status = "approved" WHERE id = ?',
                        [id]
                    );
                
                    for (const { date } of dates) {
                        await db.run(
                            'INSERT INTO leaves (employee_id, date) VALUES (?, ?)',
                            [request.employee_id, date]
                        );
                    }
                } else {
                    // Se rejeitada, exclui a solicitação e as datas associadas
                    await db.run('DELETE FROM leave_request_dates WHERE request_id = ?', [id]);
                    await db.run('DELETE FROM leave_requests WHERE id = ?', [id]);
                }

                return { 
                    dates: dates.map(d => d.date)
                };
            });

            res.json({ 
                message: `Solicitação ${action === 'approve' ? 'aprovada' : 'rejeitada e excluída'} com sucesso`,
                dates: result.dates
            });
        } catch (error) {
            
            res.status(500).json({ message: 'Erro ao processar solicitação' });
        }
    }
}

const leaveController = new LeaveController();
module.exports = leaveController;