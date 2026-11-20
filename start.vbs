' Starter Julelotteriet uten svart vindu. Lages av installasjonsfilen.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = dir
sh.Run """" & dir & "\Julemessetrekning.exe"" """ & dir & "\server.js"" --docs --open --self --quiet", 0, False
