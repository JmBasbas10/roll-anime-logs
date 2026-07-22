-- Place this ModuleScript under ServerScriptService. Never put it in ReplicatedStorage.
-- Replace the placeholders only in your private production copy.
local HttpService = game:GetService("HttpService")

local LogIngestor = {}

local API_BASE_URL = "https://YOUR-DEPLOYED-DOMAIN"
local INGEST_SECRET = "REPLACE_WITH_ROBLOX_INGEST_SECRET"
local FLUSH_INTERVAL = 2
local MAX_BATCH_SIZE = 50
local MAX_QUEUE_SIZE = 5000

local queues = {
	purchase = {},
	gift = {},
}

local flushing = {
	purchase = false,
	gift = false,
}

local function endpoint(kind)
	return string.format("%s/api/events/%s", API_BASE_URL, kind)
end

local function takeBatch(queue)
	local count = math.min(#queue, MAX_BATCH_SIZE)
	local batch = table.create(count)
	for index = 1, count do
		batch[index] = table.remove(queue, 1)
	end
	return batch
end

local function putBack(queue, batch)
	for index = #batch, 1, -1 do
		table.insert(queue, 1, batch[index])
	end
end

local function send(kind, batch)
	local response = HttpService:RequestAsync({
		Url = endpoint(kind),
		Method = "POST",
		Headers = {
			["Authorization"] = "Bearer " .. INGEST_SECRET,
			["Content-Type"] = "application/json",
		},
		Body = HttpService:JSONEncode(batch),
	})
	return response.Success and response.StatusCode >= 200 and response.StatusCode < 300, response.StatusCode
end

local function flush(kind)
	if flushing[kind] or #queues[kind] == 0 then return end
	flushing[kind] = true
	local batch = takeBatch(queues[kind])
	local success, status = pcall(send, kind, batch)
	local accepted = success and status == true
	if not accepted then
		putBack(queues[kind], batch)
		warn(string.format("Log ingestion failed for %s; %d events remain queued", kind, #queues[kind]))
	end
	flushing[kind] = false
end

local function enqueue(kind, event)
	if #queues[kind] >= MAX_QUEUE_SIZE then
		warn(string.format("Log ingestion queue is full for %s", kind))
		return false
	end
	table.insert(queues[kind], event)
	if #queues[kind] >= MAX_BATCH_SIZE then task.spawn(flush, kind) end
	return true
end

function LogIngestor.QueuePurchase(receiptInfo, playerName, productName, priceRobux)
	return enqueue("purchase", {
		receiptId = tostring(receiptInfo.PurchaseId),
		playerId = receiptInfo.PlayerId,
		playerName = playerName,
		productId = receiptInfo.ProductId,
		productName = productName,
		priceRobux = priceRobux,
		purchasedAt = os.time(),
	})
end

function LogIngestor.QueueGift(gift)
	return enqueue("gift", gift)
end

task.spawn(function()
	while true do
		task.wait(FLUSH_INTERVAL)
		for kind in pairs(queues) do task.spawn(flush, kind) end
	end
end)

game:BindToClose(function()
	local deadline = os.clock() + 20
	repeat
		for kind in pairs(queues) do flush(kind) end
		task.wait(0.25)
	until (#queues.purchase == 0 and #queues.gift == 0) or os.clock() >= deadline
end)

return LogIngestor
