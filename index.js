"use strict";
const config = require('./config'),
    /*
    Maintaining a list of activities and my preference
    The id field is the workoutId which part of classes object as a response of `api/cult/classes/` API
    */

    ActivityType = {
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
    "GET_CLASSES": "/api/cult/classes/v2?productType=FITNESS",
    "BOOK_CLASS": "/api/cult/class/${activityID}/book"
};
const HTTP_POST = "POST",
    HTTP_GET = "GET";


const PREFERRED_SLOTS = config.preferredSlots || ['09:00:00'];
const PREFERRED_CENTER = config.preferredCenter || 1515;
const PREFERRED_WORKOUT_NAME = config.preferredWorkout || "HRX WORKOUT";
const ENABLE_WAITLIST = config.enableWaitlist !== false;

const PREFERRED_CLASSES_IN_ORDER = Object.values(ActivityType).filter(
    activity => activity.name === PREFERRED_WORKOUT_NAME
);

function hasBookingForDate(classesForDay) {
    for (let timeSlot of classesForDay.classByTimeList) {
        for (let centerClass of timeSlot.centerWiseClasses) {
            if (centerClass.centerId === PREFERRED_CENTER) {
                for (let classs of centerClass.classes) {
                    if (classs.state === 'BOOKED' || classs.isBooked === true) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

async function main() {
    try {
        let classes = await makeAPICall({}, CURE_FIT_HOST, URI.GET_CLASSES, HTTP_GET, commonHeaders);
        let date = classes.days[classes.days.length - 1].id;
        
        console.log(`Booking for ${date}`);
        
        if (hasBookingForDate(classes.classByDateMap[date])) {
            console.log(`Already booked on ${date}. Skipping.`);
            return;
        }
        
        let slots = [];
        
        for (let slot of PREFERRED_SLOTS) {
            slots = getSlots(classes.classByDateMap[date], slot, PREFERRED_CLASSES_IN_ORDER);
            
            if (slots.length > 0) {
                let classInfo = slots[0];
                console.log(`Found ${PREFERRED_WORKOUT_NAME} at ${slot} on ${date}`);
                
                if (classInfo.state === 'WAITLIST_AVAILABLE') {
                    let waitlistCount = classInfo.waitlistInfo && classInfo.waitlistInfo.waitlistedUserCount || 0;
                    console.log(`Joining waitlist (${waitlistCount} people ahead)`);
                } else {
                    console.log(`Booking (${classInfo.availableSeats} seats available)`);
                }
                
                await bookClass(classInfo.id);
                console.log("Class booked successfully!");
                break;
            }
        }
        
        if (slots.length === 0) {
            console.log(`No ${PREFERRED_WORKOUT_NAME} classes available on ${date}`);
        }
    } catch (error) {
        errorHandler(error);
    }
}

main();


async function bookClass(activityID) {
    return await makeAPICall({}, CURE_FIT_HOST, "/api/cult/class/" + activityID + "/book", HTTP_POST, commonHeaders);
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
        method: method,
        headers: headers
    };

    if (method === 'POST') {
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
    
    let timeSlot = classesForDay.classByTimeList.filter(function (classByTime) {
        return classByTime.id == slot;
    })[0];
    
    if (!timeSlot) {
        return [];
    }
    
    let centerClasses = timeSlot.centerWiseClasses.filter(function (center) {
        return center.centerId == PREFERRED_CENTER;
    })[0];
    
    if (!centerClasses) {
        return [];
    }
    
    let classIDs = centerClasses.classes.filter(function (classs) {
        let filterElement = classTypes.filter(function (classType) {
            return classType.id == classs.workoutId && classType.name == classs.workoutName
        })[0];
        if (!filterElement) {
            return false;
        }
        classs.preference = filterElement.preference;
        
        if (ENABLE_WAITLIST) {
            return classs.state === 'AVAILABLE' || classs.state === 'WAITLIST_AVAILABLE';
        } else {
            return classs.state === 'AVAILABLE';
        }
    })
    .sort(function (class1, class2) {
        return class1.preference - class2.preference;
    });
    
    return classIDs;
}

function errorHandler(error) {
    console.error("Booking failed:", error);
}