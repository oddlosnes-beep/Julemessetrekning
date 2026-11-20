; Bygges av GitHub Actions. AppVersion sendes inn med /DAppVersion=...
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{B7F2C4A1-6D3E-4F1B-9A52-3C8E1D7A5E20}
AppName=Julemessetrekning
AppVersion={#AppVersion}
AppPublisher=Julemessetrekning
DefaultDirName={localappdata}\Programs\Julemessetrekning
DefaultGroupName=Julemessetrekning
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=Julemessetrekning-Setup
SetupIconFile=..\icon.ico
UninstallDisplayIcon={app}\icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no
DisableProgramGroupPage=yes
CloseApplications=no

[Languages]
Name: "norwegian"; MessagesFile: "compiler:Languages\Norwegian.isl"

[Tasks]
Name: "desktopicon"; Description: "Lag snarvei på skrivebordet"; Flags: checkedonce

[Files]
Source: "..\publish\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Julemessetrekning"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\start.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\Julemessetrekning"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\start.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\start.vbs"""; WorkingDir: "{app}"; Description: "Start Julemessetrekning nå"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
procedure StoppProgrammet();
var R: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Julemessetrekning.exe', '', SW_HIDE, ewWaitUntilTerminated, R);
  Sleep(800);
end;

function InitializeSetup(): Boolean;
begin
  StoppProgrammet();
  Result := True;
end;

function InitializeUninstall(): Boolean;
begin
  StoppProgrammet();
  Result := True;
end;
