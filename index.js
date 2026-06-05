"use strict";
const config = require('./config');

const ActivityType = {
    "hrx": {
        "id": 69,
        "name": "HRX WORKOUT",
        "displayText": "HRX WORKOUT",
        "preference": 1
    },
    "strength": {
        "id": 69,
        "name": "ADIDAS STRENGTH+",
        "displayText": "ADIDAS STRENGTH+",
        "preference": 2
    },
    "yoga": {
        "id": 5,
        "name": "EVOLVE YOGA",
        "displayText": "EVOLVE YOGA",
        "preference": 3
    },
    "dance": {
        "id": 56,
        "name": "DANCE FITNESS",
        "displayText": "DANCE FITNESS",
        "preference": 4
    },
    "burn": {
        "id": 66,
        "name": "BURN",
        "displayText": "BURN",
        "preference": 5
    },
    "boxing": {
        "id": 8,
        "name": "BOXING BAG WORKOUT",
        "displayText": "BOXING BAG WORKOUT",
        "preference": 6
    },
    "fusionDance": {
        "id": 56,
        "name": "FUSION DANCE FITNESS",
        "displayText": "FUSION DANCE FITNESS",
        "preference": 7
    }
};

const commonHeaders = {
    "accept": "application/json",
    "apikey": config.apiKey,
    "appversion": config.appVersion,
    "browsername": config.browserName,
    "osname": config.osName,
    "timezone": config.timezone,
    "content-type": "application/json",
    "Cookie": config.cookies
};

const CURE_FIT_HOST = "www.cult.fit";
const URI = {
    "GET_CLASSES": "/api/cult/classes/v2?productType=FITNESS"
};

const HTTP_POST = "POST";
const HTTP_GET = "GET";

const PREFERRED_SLOTS = config.preferredSlots || ['07:00:00'];
const PREFERRED_CENTER = config.preferredCenter || 119;
const PREFERRED_WORKOUT_NAMES = (config.preferredWorkout || "HRX WORKOUT,ADIDAS STRENGTH+")
    .split(',')
    .map(w => w.trim().toLowerCase());
const ENABLE_WAITLIST = config.enableWaitlist !== false;

const PREFERRED_CLASSES_IN_ORDER = Object.values(ActivityType).filter(
    activity => PREFERRED_WORKOUT_NAMES.includes(activity.name.toLowerCase())
);

function hasBookingForDate(classesForDay) {
    if (!classesForDay || !classesForDay.classByTimeList) {
        return false;
    }

    for (let timeSlot of classesForDay.classByTimeList) {
        for (let centerClass of timeSlot.centerWiseClasses || []) {
            if (Number(centerClass.centerId) === Number(PREFERRED_CENTER)) {
                for (let classs of centerClass.classes || []) {
                    if (classs.state === 'BOOKED' || classs.isBooked === true) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

function isWeekend(dateString) {
    const day = new Date(dateString).getDay();
    return day === 0 || day === 6;
}

async function main() {
    try {
        console.log("API Key loaded:", config.apiKey ? "YES" : "NO");
        console.log("Cookies loaded:", config.cookies ? "YES" : "NO");

        const classes = await makeAPICall({}, CURE_FIT_HOST, URI.GET_CLASSES, HTTP_GET, { ...commonHeaders });
        const date = classes.days[classes.days.length - 1].id;

        console.log(`Booking target date: ${date}`);

        if (isWeekend(date)) {
            console.log(`Target date ${date} is Saturday/Sunday. Skipping.`);
            return;
        }

        const classesForDay = classes.classByDateMap[date];

        if (hasBookingForDate(classesForDay)) {
            console.log(`Already booked on ${date}. Skipping.`);
            return;
        }

        for (let slot of PREFERRED_SLOTS) {
            const slots = getSlots(classesForDay, slot, PREFERRED_CLASSES_IN_ORDER);

            if (slots.length > 0) {
                const classInfo = slots[0];
                console.log(`Found ${classInfo.workoutName} at ${slot} on ${date}`);

                if (classInfo.state === 'WAITLIST_AVAILABLE') {
                    const waitlistCount = classInfo.waitlistInfo?.waitlistedUserCount || 0;
                    console.log(`Joining waitlist (${waitlistCount} people ahead)`);
                } else {
                    console.log(`Booking (${classInfo.availableSeats ?? 0} seats available)`);
                }

                await bookClass(classInfo.id);
                console.log("Class booked successfully!");
                return;
            }
        }

        console.log(`No preferred classes available on ${date} for slots: ${PREFERRED_SLOTS.join(', ')}`);
    } catch (error) {
        errorHandler(error);
    }
}

main();

async function bookClass(activityID) {
    return await makeAPICall({}, CURE_FIT_HOST, `/api/cult/class/${activityID}/book`, HTTP_POST, { ...commonHeaders });
}

async function makeAPICall(request, host, path, method, headers) {
    if (config.userAgent) {
        headers['User-Agent'] = config.userAgent;
    }
    if (config.referer) {
        headers['referer'] = config.referer;
    }

    const url = `https://${host}${path}`;
    const options = {
        method,
        headers
    };

    if (method === HTTP_POST) {
        options.body = JSON.stringify(request);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return await response.json();
    }

    return await response.text();
}

function getSlots(classesForDay, slot, classTypes) {
    if (!classesForDay || !classesForDay.classByTimeList) {
        return [];
    }

    const timeSlot = classesForDay.classByTimeList.find(classByTime => classByTime.id == slot);
    if (!timeSlot) {
        return [];
    }

    const centerClasses = (timeSlot.centerWiseClasses || []).find(center => Number(center.centerId) == Number(PREFERRED_CENTER));
    if (!centerClasses) {
        return [];
    }

    const classIDs = (centerClasses.classes || []).filter(classs => {
        const filterElement = classTypes.find(classType =>
            Number(classType.id) == Number(classs.workoutId) &&
            classType.name.toLowerCase() === String(classs.workoutName || '').toLowerCase()
        );

        if (!filterElement) {
            return false;
        }

        classs.preference = filterElement.preference;

        if (ENABLE_WAITLIST) {
            return classs.state === 'AVAILABLE' || classs.state === 'WAITLIST_AVAILABLE';
        }

        return classs.state === 'AVAILABLE';
    }).sort((class1, class2) => class1.preference - class2.preference);

    return classIDs;
}

function errorHandler(error) {
    console.error("Booking failed:", error.message || error);

    const message = String(error.message || error);
    if (message.includes('401') || message.includes('Unauthorized') || message.includes('Authorization header missing')) {
        console.error("Cookie/session expired or CURL_COMMAND is invalid. Update CURL_COMMAND secret.");
    }

    process.exit(1);
}
