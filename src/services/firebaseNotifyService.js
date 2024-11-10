
const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const database = require("../models/database");
const gServiceAccount = require("../../savio-d4406-firebase-adminsdk-9njvg-7ef51dd3a1.json")

function NotificationTask(taskName, taskDesc)
{
    return {
        taskName,
        taskDesc
    }
}

async function sendTaskNotification(employeeId, ...tasks)
{
    try {
        const db = await database.getDb();

        const employee = await db.get(
            `SELECT name FROM employees WHERE id = ?`,
            [employeeId]
        )

        if (employee == undefined || employee.name == undefined) {
            throw Error(`fireabaseNotifyService: employee of id ${employeeId} not found`);
        }

        const fcmToken = await db.get(
            `SELECT token FROM fcm_tokens WHERE employee_id = ?`,
            [employeeId]
        );

        if (fcmToken == undefined || fcmToken.token == undefined) {
            throw Error(`fireabaseNotifyService: fcmToken of id ${employeeId} not found`);
        }

        console.log(`TASKS FOR EMPLOYEE: ${employeeId} ${JSON.stringify(tasks)}`);

        const message = {
            token: fcmToken.token,
            data: {
                tasks: JSON.stringify(tasks)
            }
        }

        await admin.messaging().send(message)
    } catch (error) {
        console.error(error)
    }
}

async function initialize()
{
    admin.initializeApp({
        credential: admin.credential.cert(gServiceAccount),
    });
}

module.exports = {
    sendTaskNotification,
    NotificationTask,
    initialize,
};