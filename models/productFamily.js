"use strict";

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var setRound3 = MODULE('utils').setRound3;

var discountSchema = new Schema({
    _id: false,
    count: { type: Number, default: 0 },
    discount: { type: Number, default: 0, set: setRound3 }
}, {
    toObject: { virtuals: true },
    toJSON: { virtuals: true }
});

var productFamiliesSchema = new Schema({
    langs: [{
        _id: false,
        name: String
    }],

    entity: [String], // NOT Used
    //isCoef: { type: Boolean, default: false }, //Price was calculated from a coefficient
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    isCost: { type: Boolean, default: false },
    sequence: { type: Number, default: 0 }, // sort list
    indirectCostRate: { type: Number, default: 0 }, // % based on cost Direct Price
    minMargin: { type: Number, default: 0 },

    options: [{ type: Schema.Types.ObjectId, ref: 'productAttributes' }], //attributes
    variants: [{ type: Schema.Types.ObjectId, ref: 'productAttributes' }], //isVariant

    discounts: [discountSchema],

    accounts: [{
        _id: false,
        code: String,
        account: { type: String, set: MODULE('utils').setAccount, trim: true } //sell ou buy
    }]
}, {
    collection: 'productFamily',
    toObject: { virtuals: true },
    toJSON: { virtuals: true }
});

productFamiliesSchema.virtual('name').get(function() {
    return this.langs[0].name;
});

productFamiliesSchema.pre('save', function(next) {
    var self = this;

    if (!this.discounts || this.discounts.length == 0)
        this.discounts = [{
            "discount": 0,
            "count": 0
        }];
    next();
});



exports.Schema = mongoose.model('productFamily', productFamiliesSchema);
exports.name = "productFamily";

F.on('load', function() {

    return;

    var PriceListModel = MODEL('priceList').Schema;
    var ProductModel = MODEL('product').Schema;
    var round = MODULE('utils').round;

    // Refresh prices on change Base price List or on discount productList
    F.functions.PubSub.on('productFamily:*', function(channel, data) {
        //console.log(data);
        console.log("Update emit productFamily update", data, channel);
        //return;
        switch (channel) {
            // Change indirectCostRate will update all product priceList
            case 'productFamily:update':
                if (!data.data._id)
                    return;

                if (!data.data.indirectCostRate)
                    return;

                ProductModel.find({ sellFamily: data.data._id }, function(err, docs) {
                    //Load parent priceList
                    docs.forEach(function(elem) {

                        elem.indirectCost = round(elem.directCost * data.data.indirectCostRate / 100, 3);

                        elem.save(function(err) {
                            if (err)
                                console.log("update productFamily error ", err);
                        });

                    });
                });

                break;

                /**
                 * Refresh all priceList if a coef changed in productFamilyCoef
                 */
            case 'productFamily:coef':
                if (!data.data._id)
                    return;

                ProductModel.find({ sellFamily: data.data._id })
                    //.populate("priceLists")
                    .exec(function(err, docs) {

                        docs.forEach(function(elem) {
                            setTimeout2('product:updateDirectCost_' + elem._id.toString(), function() {
                                F.functions.BusMQ.emit('product:updateDirectCost', null, { product: elem });
                            }, 500);

                            //                elem.save(function(err) {
                            //                    if (err)
                            //                        console.log("update productFamily coef error ", err);
                            //                });

                        });
                    });

                break;
        }
    });
});