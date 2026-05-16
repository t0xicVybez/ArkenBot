-- ArkenBot FiveM Manager — server.lua
-- Receives authenticated HTTP commands from your Discord bot.

local token         = GetConvar('arkenbot_token', '')
local framework     = 'none'
local QBCore        = nil
local ESX           = nil
local frozenPlayers = {}  -- [src] = { x, y, z }

-- Re-teleport frozen players every tick so they cannot move
CreateThread(function()
    while true do
        Wait(0)
        for src, coords in pairs(frozenPlayers) do
            if GetPlayerName(tostring(src)) then
                local ped = GetPlayerPed(tostring(src))
                SetEntityCoords(ped, coords.x, coords.y, coords.z, false, false, false, false)
                SetEntityVelocity(ped, 0.0, 0.0, 0.0)
            else
                frozenPlayers[src] = nil
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    frozenPlayers[tonumber(source)] = nil
end)

-- ─── Startup ─────────────────────────────────────────────────────────────────

if token == '' then
    print('^1[ArkenBot] WARNING: arkenbot_token convar is not set! All requests will be rejected.^0')
else
    print('^2[ArkenBot] arkenbot_token loaded.^0')
end

-- ─── Framework detection ─────────────────────────────────────────────────────

AddEventHandler('onResourceStart', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end

    Citizen.SetTimeout(1000, function()
        if GetResourceState('qb-core') == 'started' then
            QBCore    = exports['qb-core']:GetCoreObject()
            framework = 'qbcore'
            print('^2[ArkenBot] Framework detected: QBCore^0')
        elseif GetResourceState('es_extended') == 'started' then
            ESX       = exports['es_extended']:getSharedObject()
            framework = 'esx'
            print('^2[ArkenBot] Framework detected: ESX^0')
        else
            framework = 'none'
            print('^3[ArkenBot] No supported framework detected (qb-core / es_extended). Some actions will be unavailable.^0')
        end
        print('^2[ArkenBot] HTTP bridge ready. Listening at /arkenbot/execute^0')
    end)
end)

-- ─── Helpers ─────────────────────────────────────────────────────────────────

local function getQBPlayer(id)
    if not QBCore then return nil, 'QBCore not available' end
    local player = QBCore.Functions.GetPlayer(id)
    if not player then return nil, 'Player not found (id=' .. tostring(id) .. ')' end
    return player, nil
end

local function getESXPlayer(id)
    if not ESX then return nil, 'ESX not available' end
    local player = ESX.GetPlayerFromId(id)
    if not player then return nil, 'Player not found (id=' .. tostring(id) .. ')' end
    return player, nil
end

-- ─── Actions ─────────────────────────────────────────────────────────────────

local actions = {}

-- status
actions.status = function(_params)
    local players   = GetPlayers()
    local maxPlayers = GlobalState.MaxPlayers or tonumber(GetConvar('sv_maxclients', '32')) or 32
    return {
        playerCount = #players,
        maxPlayers  = maxPlayers,
        hostname    = GetConvar('sv_hostname', 'Unknown'),
        framework   = framework,
    }, nil
end

-- players
actions.players = function(_params)
    local list = {}
    for _, src in ipairs(GetPlayers()) do
        local id = tonumber(src)
        table.insert(list, {
            id          = id,
            name        = GetPlayerName(src),
            ping        = GetPlayerPing(src),
            identifiers = (function()
                local ids = {}
                for i = 0, GetNumPlayerIdentifiers(src) - 1 do
                    table.insert(ids, GetPlayerIdentifier(src, i))
                end
                return ids
            end)(),
        })
    end
    return list, nil
end

-- playerinfo
actions.playerinfo = function(params)
    local id  = tonumber(params.id)
    local src = tostring(id)

    if not GetPlayerName(src) then
        return nil, 'Player not found (id=' .. tostring(id) .. ')'
    end

    local identifiers = {}
    for i = 0, GetNumPlayerIdentifiers(src) - 1 do
        table.insert(identifiers, GetPlayerIdentifier(src, i))
    end

    local info = {
        id          = id,
        name        = GetPlayerName(src),
        ping        = GetPlayerPing(src),
        identifiers = identifiers,
    }

    if framework == 'qbcore' then
        local player, err = getQBPlayer(id)
        if err then return nil, err end
        local pd       = player.PlayerData
        local job      = pd.job or {}
        info.job       = job.name
        info.jobGrade  = job.grade and job.grade.level
        info.citizenid = pd.citizenid
        info.money     = {
            cash   = pd.money and pd.money.cash,
            bank   = pd.money and pd.money.bank,
            crypto = pd.money and pd.money.crypto,
        }
    elseif framework == 'esx' then
        local player, err = getESXPlayer(id)
        if err then return nil, err end
        local job      = player.getJob()
        info.job        = job.name
        info.jobGrade   = job.grade
        info.identifier = player.getIdentifier()
        info.money      = {
            cash = player.getMoney(),
            bank = player.getAccount('bank') and player.getAccount('bank').money,
        }
    end

    return info, nil
end

-- kick
actions.kick = function(params)
    local id     = tonumber(params.id)
    local reason = params.reason or 'Kicked by staff'
    if not GetPlayerName(tostring(id)) then
        return nil, 'Player not found (id=' .. tostring(id) .. ')'
    end
    DropPlayer(tostring(id), reason)
    return { kicked = id, reason = reason }, nil
end

-- ban
actions.ban = function(params)
    local id       = tonumber(params.id)
    local reason   = params.reason or 'Banned by staff'
    local duration = params.duration or 'permanent'

    if not GetPlayerName(tostring(id)) then
        return nil, 'Player not found (id=' .. tostring(id) .. ')'
    end

    local note = nil

    if framework == 'qbcore' and GetResourceState('qb-ban') == 'started' then
        TriggerEvent('qb-ban:server:BanPlayer', {
            source   = id,
            reason   = reason,
            duration = duration,
        })
    elseif framework == 'esx' and GetResourceState('esx_ban') == 'started' then
        TriggerEvent('esx_ban:ban', id, reason)
    else
        -- Fallback: drop with [BANNED] prefix
        DropPlayer(tostring(id), '[BANNED] ' .. reason)
        note = 'No ban resource found — player was dropped with [BANNED] prefix. Persistent ban was NOT applied.'
    end

    local result = { banned = id, reason = reason, duration = duration }
    if note then result.note = note end
    return result, nil
end

-- giveitem
actions.giveitem = function(params)
    local id     = tonumber(params.id)
    local item   = params.item
    local amount = tonumber(params.amount) or 1

    if framework == 'qbcore' then
        local player, err = getQBPlayer(id)
        if err then return nil, err end
        local ok = player.Functions.AddItem(item, amount)
        if not ok then return nil, 'AddItem failed — item may not exist in QB items list' end
        TriggerClientEvent('inventory:client:ItemBox', id, QBCore.Shared.Items[item], 'add')
        return { gave = item, amount = amount, player = id }, nil
    elseif framework == 'esx' then
        local player, err = getESXPlayer(id)
        if err then return nil, err end
        if string.match(string.upper(item), '^WEAPON_') then
            local weaponName = string.upper(item)
            player.addWeapon(weaponName, amount)
            TriggerClientEvent('arkenbot:giveWeapon', id, weaponName, amount)
        else
            player:addInventoryItem(item, amount)
            TriggerClientEvent('arkenbot:giveItem', id, item, amount)
        end
        return { gave = item, amount = amount, player = id }, nil
    else
        return nil, 'No supported framework — cannot give items'
    end
end

-- removeitem
actions.removeitem = function(params)
    local id     = tonumber(params.id)
    local item   = params.item
    local amount = tonumber(params.amount) or 1

    if framework == 'qbcore' then
        local player, err = getQBPlayer(id)
        if err then return nil, err end
        local ok = player.Functions.RemoveItem(item, amount)
        if not ok then return nil, 'RemoveItem failed — player may not have enough of that item' end
        return { removed = item, amount = amount, player = id }, nil
    elseif framework == 'esx' then
        local player, err = getESXPlayer(id)
        if err then return nil, err end
        if string.match(string.upper(item), '^WEAPON_') then
            player.removeWeapon(string.upper(item))
        else
            player:removeInventoryItem(item, amount)
        end
        return { removed = item, amount = amount, player = id }, nil
    else
        return nil, 'No supported framework — cannot remove items'
    end
end

-- givemoney
actions.givemoney = function(params)
    local id      = tonumber(params.id)
    local account = params.account or 'cash'
    local amount  = tonumber(params.amount) or 0

    if framework == 'qbcore' then
        local player, err = getQBPlayer(id)
        if err then return nil, err end
        player.Functions.AddMoney(account, amount)
        return { gave = amount, account = account, player = id }, nil
    elseif framework == 'esx' then
        local player, err = getESXPlayer(id)
        if err then return nil, err end
        -- ESX cash account is named 'money', not 'cash'
        local esxAccount = account == 'cash' and 'money' or account
        local current = player.getAccount(esxAccount)
        if not current then
            return nil, 'Account "' .. esxAccount .. '" not found'
        end
        player.setAccountMoney(esxAccount, math.floor(current.money + amount))
        return { gave = amount, account = account, player = id }, nil
    else
        return nil, 'No supported framework — cannot give money'
    end
end

-- removemoney
actions.removemoney = function(params)
    local id      = tonumber(params.id)
    local account = params.account or 'cash'
    local amount  = tonumber(params.amount) or 0

    if framework == 'qbcore' then
        local player, err = getQBPlayer(id)
        if err then return nil, err end
        player.Functions.RemoveMoney(account, amount)
        return { removed = amount, account = account, player = id }, nil
    elseif framework == 'esx' then
        local player, err = getESXPlayer(id)
        if err then return nil, err end
        local esxAccount = account == 'cash' and 'money' or account
        local current = player.getAccount(esxAccount)
        if not current then
            return nil, 'Account "' .. esxAccount .. '" not found'
        end
        player.setAccountMoney(esxAccount, math.max(0, math.floor(current.money - amount)))
        return { removed = amount, account = account, player = id }, nil
    else
        return nil, 'No supported framework — cannot remove money'
    end
end

-- setjob
actions.setjob = function(params)
    local id    = tonumber(params.id)
    local job   = params.job
    local grade = tonumber(params.grade) or 0

    if framework == 'qbcore' then
        local player, err = getQBPlayer(id)
        if err then return nil, err end
        player.Functions.SetJob(job, grade)
        return { player = id, job = job, grade = grade }, nil
    elseif framework == 'esx' then
        local player, err = getESXPlayer(id)
        if err then return nil, err end
        player.setJob(job, grade)
        return { player = id, job = job, grade = grade }, nil
    else
        return nil, 'No supported framework — cannot set job'
    end
end

-- announce
actions.announce = function(params)
    local message = params.message or ''
    if framework == 'qbcore' then
        TriggerClientEvent('QBCore:Notify', -1, message, 'primary', 10000)
    elseif framework == 'esx' then
        TriggerClientEvent('esx:showNotification', -1, message)
    else
        ExecuteCommand('say ' .. message)
    end
    return { announced = message }, nil
end

-- startresource
actions.startresource = function(params)
    local resource = params.resource
    StartResource(resource)
    return { started = resource }, nil
end

-- stopresource
actions.stopresource = function(params)
    local resource = params.resource
    if resource == GetCurrentResourceName() then
        return nil, 'Cannot stop the arkenbot resource itself'
    end
    StopResource(resource)
    return { stopped = resource }, nil
end

-- restartresource
actions.restartresource = function(params)
    local resource = params.resource
    if resource == GetCurrentResourceName() then
        return nil, 'Cannot restart the arkenbot resource itself'
    end
    StopResource(resource)
    Citizen.Wait(500)
    StartResource(resource)
    return { restarted = resource }, nil
end

-- warn
actions.warn = function(params)
    local id     = tonumber(params.id)
    local reason = params.reason or 'No reason given'
    local src    = tostring(id)
    if not GetPlayerName(src) then
        return nil, 'Player not found (id=' .. tostring(id) .. ')'
    end
    if framework == 'qbcore' then
        TriggerClientEvent('QBCore:Notify', id, '⚠️ Warning: ' .. reason, 'error', 10000)
    elseif framework == 'esx' then
        TriggerClientEvent('esx:showNotification', id, '⚠️ Warning: ' .. reason)
    else
        TriggerClientEvent('chat:addMessage', id, {
            color     = { 255, 0, 0 },
            multiline = true,
            args      = { '[Staff Warning]', reason },
        })
    end
    return { warned = id, reason = reason }, nil
end

-- freeze
actions.freeze = function(params)
    local id     = tonumber(params.id)
    local freeze = params.freeze
    if freeze == nil then freeze = true end
    local src = tostring(id)
    if not GetPlayerName(src) then
        return nil, 'Player not found (id=' .. tostring(id) .. ')'
    end
    if freeze then
        local ped    = GetPlayerPed(src)
        local coords = GetEntityCoords(ped)
        frozenPlayers[id] = { x = coords.x, y = coords.y, z = coords.z }
        if framework == 'qbcore' then
            TriggerClientEvent('QBCore:Notify', id, 'You have been frozen by staff.', 'error', 8000)
        elseif framework == 'esx' then
            TriggerClientEvent('esx:showNotification', id, 'You have been frozen by staff.')
        end
    else
        frozenPlayers[id] = nil
        if framework == 'qbcore' then
            TriggerClientEvent('QBCore:Notify', id, 'You have been unfrozen.', 'success', 5000)
        elseif framework == 'esx' then
            TriggerClientEvent('esx:showNotification', id, 'You have been unfrozen.')
        end
    end
    return { player = id, frozen = freeze }, nil
end

-- revive
actions.revive = function(params)
    local id  = tonumber(params.id)
    local src = tostring(id)
    if not GetPlayerName(src) then
        return nil, 'Player not found (id=' .. tostring(id) .. ')'
    end
    if framework == 'qbcore' then
        TriggerClientEvent('hospital:client:Revive', id)
    elseif framework == 'esx' then
        TriggerClientEvent('esx_ambulancejob:revive', id)
    else
        TriggerClientEvent('arkenbot:revive', id)
    end
    return { revived = id }, nil
end

-- heal
actions.heal = function(params)
    local id  = tonumber(params.id)
    local src = tostring(id)
    if not GetPlayerName(src) then
        return nil, 'Player not found (id=' .. tostring(id) .. ')'
    end
    if framework == 'qbcore' then
        TriggerClientEvent('hospital:client:Revive', id)
    elseif framework == 'esx' then
        TriggerClientEvent('esx_ambulancejob:revive', id)
    else
        return nil, 'No supported framework — cannot heal server-side'
    end
    return { healed = id }, nil
end

-- setgang (QBCore only)
actions.setgang = function(params)
    local id    = tonumber(params.id)
    local gang  = string.lower(params.gang)  -- QBCore gang names are always lowercase
    local grade = tonumber(params.grade) or 0
    if framework ~= 'qbcore' then
        return nil, 'setgang is only available with QBCore'
    end
    local player, err = getQBPlayer(id)
    if err then return nil, err end
    if not QBCore.Shared.Gangs[gang] then
        return nil, 'Gang "' .. gang .. '" not found — check the name (QBCore gang names are lowercase, e.g. "vagos")'
    end
    if not QBCore.Shared.Gangs[gang].grades[tostring(grade)] then
        return nil, 'Grade ' .. grade .. ' does not exist for gang "' .. gang .. '"'
    end
    player.Functions.SetGang(gang, grade)
    return { player = id, gang = gang, grade = grade }, nil
end

-- clearinventory
actions.clearinventory = function(params)
    local id = tonumber(params.id)
    if framework == 'qbcore' then
        local player, err = getQBPlayer(id)
        if err then return nil, err end
        local items = player.PlayerData.items or {}
        for slot, item in pairs(items) do
            if item then
                player.Functions.RemoveItem(item.name, item.amount, slot)
            end
        end
        return { cleared = id }, nil
    elseif framework == 'esx' then
        local player, err = getESXPlayer(id)
        if err then return nil, err end
        -- Clear regular inventory items
        local inventory = player.getInventory()
        for _, item in pairs(inventory) do
            if item.count > 0 then
                player:removeInventoryItem(item.name, item.count)
            end
        end
        -- Clear weapons (loadout)
        local loadout = player.getLoadout()
        for _, weapon in pairs(loadout or {}) do
            if weapon and weapon.name and player.removeWeapon then
                player.removeWeapon(weapon.name)
            end
        end
        return { cleared = id }, nil
    else
        return nil, 'No supported framework — cannot clear inventory'
    end
end

-- setcoords
actions.setcoords = function(params)
    local id  = tonumber(params.id)
    local x   = tonumber(params.x)
    local y   = tonumber(params.y)
    local z   = tonumber(params.z)
    local src = tostring(id)
    if not GetPlayerName(src) then
        return nil, 'Player not found (id=' .. tostring(id) .. ')'
    end
    local ped = GetPlayerPed(src)
    SetEntityCoords(ped, x, y, z, false, false, false, false)
    return { player = id, coords = { x = x, y = y, z = z } }, nil
end

-- resources
actions.resources = function(_params)
    local list  = {}
    local count = GetNumResources()
    for i = 0, count - 1 do
        local name = GetResourceByFindIndex(i)
        if name and name ~= '' then
            local state = GetResourceState(name)
            if state ~= 'missing' then
                table.insert(list, { name = name, state = state })
            end
        end
    end
    return list, nil
end

-- rcon
actions.rcon = function(params)
    local command = params.command
    if not command or command == '' then
        return nil, 'No command provided'
    end
    ExecuteCommand(tostring(command))
    return { executed = command }, nil
end

-- ─── HTTP Handler ─────────────────────────────────────────────────────────────

SetHttpHandler(function(req, res)
    -- Only handle POST /arkenbot/execute
    if req.method ~= 'POST' or req.path ~= '/execute' then
        res.writeHead(404, { ['Content-Type'] = 'application/json' })
        res.send('{"error":"Not found"}')
        return
    end

    req.setDataHandler(function(body)
        -- Parse JSON body
        local ok, data = pcall(json.decode, body)
        if not ok or type(data) ~= 'table' then
            res.writeHead(400, { ['Content-Type'] = 'application/json' })
            res.send('{"error":"Invalid JSON body"}')
            return
        end

        -- Validate token
        if token == '' or data.token ~= token then
            res.writeHead(401, { ['Content-Type'] = 'application/json' })
            res.send('{"error":"Unauthorized — token mismatch or arkenbot_token not set"}')
            return
        end

        -- Validate action
        local action = data.action
        if type(action) ~= 'string' or not actions[action] then
            res.writeHead(400, { ['Content-Type'] = 'application/json' })
            res.send('{"error":"Unknown action: ' .. tostring(action) .. '"}')
            return
        end

        -- Dispatch
        local params = data.params or {}
        local result, err = actions[action](params)

        if err then
            res.writeHead(500, { ['Content-Type'] = 'application/json' })
            res.send(json.encode({ error = err }))
        else
            res.writeHead(200, { ['Content-Type'] = 'application/json' })
            res.send(json.encode({ success = true, data = result }))
        end
    end)
end)
