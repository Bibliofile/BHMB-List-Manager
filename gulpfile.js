var gulp = require('gulp');
var rename = require('gulp-rename');
var babel = require('gulp-babel');
var stripDebug = require('gulp-strip-debug');

gulp.task('babel', function() {
	return gulp.src(['manager.es'])
		.pipe(babel({
			presets: ['es2015']
		}))
		.pipe(stripDebug())
		.pipe(rename('manager.js'))
		.pipe(gulp.dest('.'));
});

gulp.task('watch', ['babel'], function() {
	gulp.watch('manager.es', ['babel']);
});

gulp.task('default', ['watch']);
