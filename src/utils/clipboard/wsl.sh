#!/bin/sh
scriptPath=$(echo $0 | awk '{ print substr( $0, 1, length($0)-6 ) }')"windows10.ps1"
imagePath=$(echo $1 | awk '{ print substr( $0, 1, length($0)-18 ) }')
imageName=$(echo $1 | awk '{ print substr( $0, length($0)-17, length($0) ) }')

res=$(powershell.exe -noprofile -noninteractive -nologo -sta -executionpolicy unrestricted -file $(wslpath -w $scriptPath) $(wslpath -w $imagePath)"\\"$imageName)

noImage=$(echo "no image\r")

if [ "$res" = "$noImage" ] ;then
    echo "no image"
else
    echo $(wslpath -u -a "${res}")
fi
