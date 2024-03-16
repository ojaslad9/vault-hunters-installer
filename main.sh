apt install wget unzip openjdk-17-jre -y
wget https://www.curseforge.com/api/v1/mods/711537/files/5076205/download
mv download download.zip
unzip download.zip
wget https://maven.minecraftforge.net/net/minecraftforge/forge/1.18.2-40.2.9/forge-1.18.2-40.2.9-installer.jar
apt update
java -jar forge-1.18.2-40.2.9-installer.jar --installServer
