import {cityImageList} from "./constants";

function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function sfc32(a, b, c, d) {
    return function () {
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;
        var t = (a + b) | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        d = d + 1 | 0;
        t = t + d | 0;
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    }
}


function mulberry32(a) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

//generateSurveyID
//decodeSurveyId
//generateSurveyImage


export const CITY_LIST = [
    "Seoul"  // Only Seoul now
   //"Amsterdam",
    //"Barcelona",
   // "Buenos Aires",
   // "Dubai",
    //"Nairobi",
    //"Québec City",
   // "Singapore",
    //"Trondheim",
];
export const CITY_HASH = {
    "Seoul": 'sel',  // Short hash for Seoul
    //"Amsterdam": 'ams',
    //"Barcelona": 'bcn',
    //"Buenos Aires": 'bue',
    //"Dubai": 'dxb',
    //"Québec City": "que",
    //"Nairobi": "nai",
    //"Singapore": "sin",
    //"Trondheim": "tro",
}

export const PROPER_CITY_NAME = {
    "Seoul": 'Seoul',
    //"Amsterdam": 'Amsterdam',
    //"Barcelona": 'Barcelona',
    //"Buenos Aires": 'Buenos_Aires',
    //"Dubai": 'Dubai',
    //"Québec City": "Quebec_City",
    //"Nairobi": "Nairobi",
    //"Singapore": "Singapore",
    //"Trondheim": "Trondheim",
}

function choice(randFunc, length, N) {
    // Pick N from 1...length, non-duplicate
    let result = [];
    for (let i = 0; i < N; i++) {
        let index = Math.floor(randFunc() * length);
        while (result.includes(index)) {
            index = Math.floor(randFunc() * length);
        }
        result.push(index);
    }
    return result;
}

function _item(city, bag, index) {
    const category = bag.category;
    const name = bag.items[bag.choices[index]];
    const properCityName = PROPER_CITY_NAME[city];
    return `${properCityName}/${category}/${name}`
}

function getImageSet(city, randFunc, topLively, bottomLively, topBeauty, bottomBeauty) {

    const item = (bag, index) => {
        return _item(city, bag, index);
    }

    // Pick 4 from top lively, bottom ..., non-duplicate
    let topLivelyItems = {
        category: 'topLively', items: topLively, choices: choice(randFunc, topLively.length, 3),
    };
    let bottomLivelyItems = {
        category: 'bottomLively', items: bottomLively, choices: choice(randFunc, bottomLively.length, 3),
    };
    let topBeautyItems = {
        category: 'topBeauty', items: topBeauty, choices: choice(randFunc, topBeauty.length, 3),
    };
    let bottomBeautyItems = {
        category: 'bottomBeauty', items: bottomBeauty, choices: choice(randFunc, bottomBeauty.length, 3),
    };


    return [
        // Pick 2 from top lively
        [item(topLivelyItems, 0), item(topLivelyItems, 1)],
        // Pick 2 from bottom lively
        [item(bottomLivelyItems, 0), item(bottomLivelyItems, 1)],
        // Pick 2 from top beauty
        [item(topBeautyItems, 0), item(topBeautyItems, 1)],
        // Pick 2 from bottom beauty
        [item(bottomBeautyItems, 0), item(bottomBeautyItems, 1)],
        // Pick 1 from top lively, 1 from bottom lively
        [item(topLivelyItems, 2), item(bottomLivelyItems, 2)],
        // Pick 1 from top beauty, 1 from bottom beauty
        [item(topBeautyItems, 2), item(bottomBeautyItems, 2)],
    ];
}


function getCityImageList(city) {
    const properCityName = PROPER_CITY_NAME[city];
    // console.log(properCityName);
    return cityImageList[properCityName];
}

function _generateSurveyId() {
    // Set random seed using current timestamp
    const seed = Math.floor(Date.now());
    const randFunc = mulberry32(seed);

    // Generate 8 random ascii characters
    let surveyId = "";
    for (let i = 0; i < 8; i++) {
        surveyId += String.fromCharCode(Math.floor(randFunc() * 26) + 97);
    }
    return surveyId;
}


export function decodeSurveyID(surveyID) {
    // Split surveyID with "_" and get cityHash and surveyHash
    const [cityHash, surveyHash] = surveyID.split("_");

    // Turn city hash into city name
    const city = Object.keys(CITY_HASH).find(key => CITY_HASH[key] === cityHash);
    const {
        topLively, bottomLively, topBeauty, bottomBeauty,
    } = getCityImageList(city);

    // Get the image sequence
    const seed = cyrb128(surveyHash);
    const randFunc = sfc32(seed[0], seed[1], seed[2], seed[3]);
    const imageSet = getImageSet(city, randFunc, topLively, bottomLively, topBeauty, bottomBeauty);

    return {city, surveyHash, imageSet};

}

export function generateSurveyID(city) {
    // SurveyID is `aaa_bbbbbbbb` ({city}_{surveyhash})
    if (!CITY_LIST.includes(city)) {
        console.error(`City ${city} is not in the list.`)
        throw new Error(`City ${city} is not in the list.`)
    }
    const city_hash = CITY_HASH[city];
    const survey_hash = _generateSurveyId();

    // Organize the survey id
    return `${city_hash}_${survey_hash}`;
}