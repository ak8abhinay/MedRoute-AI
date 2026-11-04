/*
Terminal	Command	From directory
1	docker run => docker start hungry_jackson ... osrm-routed ...	osrm/data => curl "http://localhost:5001/route/v1/driving/78.4867,17.3850;78.4900,17.4000?overview=false"
2	node server.js	project root
3	npm run dev	client/
4	node server/simulator/index.js	project root

node scripts/resetTestData.js

source venv/bin/activate => to python3 scripts/train_model.py when working with ml-services
uvicorn app.main:app --reload --port 8000 => start ml-service
*/

/*
Open Terminal 1:
cd ~/MedRoute-AI/osrm/data
docker ps -a --filter name=hungry_jackson
docker start hungry_jackson
curl "http://localhost:5001/route/v1/driving/78.4867,17.3850;78.4900,17.4000?overview=false"
You should receive JSON containing a route and distance/duration information.

Terminal 2 — Backend
cd ~/MedRoute-AI
node server.js
Keep it running. Check the terminal for MongoDB connection errors or a port conflict.

Terminal 3 — Frontend
cd ~/MedRoute-AI/client
npm run dev
Open the local URL printed by Vite, usually http://localhost:5173

Terminal 4 — Ambulance simulator
cd ~/MedRoute-AI
node server/simulator/index.js
Keep it running so simulated ambulances can update their locations and movement

Terminal 5 — ML service
Only start this if you want to run the separate Python ML service:
cd ~/MedRoute-AI/ml-service
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
*/
/*
Admin : admin1@example.com/AdminRoute@2026
dispatcher : d1@example.com / dispatch-pass-1

*/ 