; Pasos propios del instalador de MikaLog. Sin acentos: NSIS lee este archivo
; con la codificacion del sistema.

!macro NSIS_HOOK_POSTUNINSTALL
  ; Al actualizar, el instalador nuevo desinstala la version anterior: ahi no
  ; se avisa. En una desinstalacion silenciosa se da el aviso por aceptado.
  ${If} $UpdateMode <> 1
    MessageBox MB_OK|MB_ICONINFORMATION "MikaLog se ha desinstalado.$\n$\nTus datos no se han borrado: siguen en tu carpeta de datos (si no la cambiaste, Documentos\MikaLog)." /SD IDOK
  ${EndIf}
!macroend
