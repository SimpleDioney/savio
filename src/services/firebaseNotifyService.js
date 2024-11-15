
const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const database = require("../models/database");
const gServiceAccount = require("../../savio-d4406-firebase-adminsdk-9njvg-7ef51dd3a1.json");
const { logDebug, logError } = require("./log");

function NotificationTask(taskName, taskDesc, taskPriority)
{
    return {
        name: taskName,
        desc: taskDesc,
        priority: taskPriority
    }
}

async function sendTaskNotification(toEmployeeId, fromEmployeeId, isAdmin, ...tasks) {
    try {
        const db = await database.getDb();

        let { fromEmployee, toEmployee } = await db.get(
            `SELECT
                (SELECT name FROM employees WHERE id = ?) AS fromEmployee,
                (SELECT name FROM employees WHERE id = ?) AS toEmployee;
            `,
            [fromEmployeeId, toEmployeeId]
        );

        if (isAdmin) {
            fromEmployee = "Admin"
        }

        let formattedFromEmployee = `(${fromEmployeeId})${fromEmployee}`;
        let formattedToEmployee = `(${toEmployeeId})${toEmployee}`;

        if (toEmployee == undefined || (fromEmployee == undefined && !isAdmin)) {
            throw Error(
                `Unable to send notification from employee: ${formattedFromEmployee} to employee ${formattedToEmployee}`
            );
        }

        const { token } = await db.get(
            `SELECT (SELECT token FROM fcm_tokens WHERE employee_id = ?) AS token;`,
            [toEmployeeId]
        );

        if (token == undefined) {
            throw Error(`Token for user ${formattedToEmployee} not found`);
        }

        const time = new Date().getTime();

        console.log(time.toString());
        console.log(toEmployeeId.toString());

        const messageToSent = {
            token,
            data: {
                fromEmployee,
                toEmployee,
                toEmployeeId: toEmployeeId.toString(),
                time: time.toString(),
                tasks: JSON.stringify(tasks),
            },
        };

        await admin.messaging().send(messageToSent);

        logDebug(
            "FIREBASENOTIFYSERVICE",
            `A notification was sent to user ${formattedToEmployee} for a task created by user ${formattedFromEmployee}`,
            {
                ...messageToSent,
                token: null,
            }
        );
    } catch (error) {
        logError("FIREBASENOTIFYSERVICE", error);
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