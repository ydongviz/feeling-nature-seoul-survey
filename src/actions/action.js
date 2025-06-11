// State machine change function
export function updateSurveyID(state, payload) {
    return {
        ...state,
        surveyId: payload
    };
}


export function update1stQuestion(state, payload) {
    return {
        ...state,
        info: payload, // TODO: Rename the key
    };
}

export function updateSurveyProgress(state, payload) {
    let result = state["surveyResult"] || {};
    const index = payload["questionID"];
    result[index] = payload;
    return {
        ...state,
        "surveyResult": result,
    };
}

export function updateLastInfoQuestion(state, payload) {
    return {
        ...state,
        ...payload,
    };
}