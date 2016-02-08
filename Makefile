
lambda:
	@echo "Factory package files..."
	@if [ ! -d build ] ;then mkdir build; fi
	@cp createThumbnails.js build/createThumbnails.js
	@if [ ! -d build/node_modules ] ;then mkdir build/node_modules; fi
	@cp -R node_modules/async build/node_modules/
	@cp -R node_modules/gm build/node_modules/
	@echo "Create package archive..."
	@cd build && zip -rq aws-lambda-image.zip .
	@mv build/aws-lambda-image.zip ./
