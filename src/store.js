import {createStore, StateMachineProvider} from "little-state-machine";

export function create_global_store() {
    createStore({
        'language': 'Korean',
    }, {
        name: 'SurveyData',
        middleWares: [],
    });
}

