import { useEffect, useState } from "react";
import api from "./api";

let cache = null;
let inflight = null;

export function loadCompany(force = false) {
    if (cache && !force) return Promise.resolve(cache);
    if (!inflight || force) {
        inflight = api
            .get("/api/company")
            .then(({ data }) => {
                cache = data;
                return data;
            })
            .finally(() => {
                inflight = null;
            });
    }
    return inflight;
}

export function clearCompanyCache() {
    cache = null;
}

// Company settings (GST registration, state, numbering) shared by the document forms.
export function useCompany() {
    const [company, setCompany] = useState(cache);

    useEffect(() => {
        let active = true;
        loadCompany()
            .then((data) => active && setCompany(data))
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    return company;
}

let statesCache = null;

export function useStates() {
    const [states, setStates] = useState(statesCache || []);

    useEffect(() => {
        if (statesCache) return;
        api.get("/api/company/states")
            .then(({ data }) => {
                statesCache = data;
                setStates(data);
            })
            .catch(() => {});
    }, []);

    return states;
}
