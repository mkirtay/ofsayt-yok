import axios from 'axios';

const API_BASE_URL = '/api/livescore';

export const liveScoreApi = axios.create({
  baseURL: API_BASE_URL,
});
