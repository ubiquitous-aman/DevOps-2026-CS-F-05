import http from 'k6/http';
import { check, sleep } from 'k6';

// Simulate 6 concurrent users for 30 seconds
export const options = {
  vus: 6,
  duration: '30s',
};

export default function () {
  // We will hit the health endpoint of your backend
  const res = http.get('http://localhost:9090/api/health');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  // Wait 1 second between requests to simulate real user behavior
  sleep(1);
}
