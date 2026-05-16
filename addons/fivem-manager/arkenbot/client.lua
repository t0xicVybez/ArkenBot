-- ArkenBot FiveM Manager — client.lua

RegisterNetEvent('arkenbot:giveWeapon')
AddEventHandler('arkenbot:giveWeapon', function(weapon, ammo)
    GiveWeaponToPed(PlayerPedId(), GetHashKey(weapon), ammo, false, true)
end)

RegisterNetEvent('arkenbot:giveItem')
AddEventHandler('arkenbot:giveItem', function(item, count)
    -- Refresh ESX inventory so item appears immediately
    TriggerEvent('esx:loadInventoryItem', item, count)
end)
