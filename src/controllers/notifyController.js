const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const database = require("../models/database");

class NotifyController {
    async fcmTokenRegister(req, res) {
        try {
            const db = await database.getDb();
            const { employee_id, token } = req.body;

            const responseSuccess = await db.run(
                `INSERT OR REPLACE INTO fcm_tokens (token, employee_id)VALUES (?, ?)`,
                [token, employee_id]
            );

            const message = {
                notification: {
                    title: "Titulo da notificação?",
                    body: "Corpo da notificação"
                },
                token
            }

            await admin.messaging().send(message);

            return res.status(200).json({
                "message": "Sucesso"
            })
        } catch (error) {
            console.error(error)
            res.status(500).json({
                "message": "Error"
            })
        }
    }
}

const notifyController = new NotifyController();
module.exports = notifyController
