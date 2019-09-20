#
git clone https://github.com/rleddy/microgateway-quality.git
cp microgateway-quality/prevCount.json .
#
TAG=$(node npmversion.js)
node diffErrors.js $TAG
rm -rf microgateway-quality/
